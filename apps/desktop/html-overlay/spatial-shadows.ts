/** Fixed renderer policy; source is host-owned and runs only against admitted scene meshes. */
export const SPATIAL_SHADOW_POLICY = Object.freeze({
  profile: "slopcamera.caster-fit-shadows-v1",
  maximumMapSize: 2048,
  maximumAtlasTexels: 16_777_216,
  pointMapFaces: 6,
  depthBias: -0.00005,
  maximumNormalBiasMeters: 0.05,
  normalBiasTexels: 0.35,
});

/** Kept as one injected source seam so CPU tests execute the exact browser algorithm. */
export function spatialShadowRuntimeSource(): string {
  return `const spatialShadowPolicy=${JSON.stringify(SPATIAL_SHADOW_POLICY)};
const configureSpatialShadows=(world,maximumTextureSize,track)=>{
  world.updateMatrixWorld(true);
  const lights=[],casters=new THREE.Box3();
  for(const object of world.children){
    if(object.isLight&&object.castShadow&&object.shadow)lights.push(object);
    if(object.isMesh&&object.castShadow){
      if(!object.geometry.boundingBox)object.geometry.computeBoundingBox();
      if(object.geometry.boundingBox)casters.union(object.geometry.boundingBox.clone().applyMatrix4(object.matrixWorld));
    }
  }
  if(lights.length===0)return;
  const atlasFaces=lights.reduce((sum,light)=>sum+(light.isPointLight?spatialShadowPolicy.pointMapFaces:1),0);
  const fairSize=2**Math.floor(Math.log2(Math.sqrt(spatialShadowPolicy.maximumAtlasTexels/atlasFaces)));
  const center=new THREE.Vector3(),size=new THREE.Vector3();
  const hasCasters=!casters.isEmpty();
  if(hasCasters){casters.getCenter(center);casters.getSize(size);}
  const diameter=hasCasters?Math.max(size.length(),0.001):1;
  for(const light of lights){
    const shadow=light.shadow;
    const hardwareSize=2**Math.floor(Math.log2(maximumTextureSize));
    const mapSize=Math.max(1,Math.min(spatialShadowPolicy.maximumMapSize,fairSize,hardwareSize));
    shadow.mapSize.set(mapSize,mapSize);
    shadow.bias=spatialShadowPolicy.depthBias;
    let texelSpan=diameter/mapSize;
    if(light.isDirectionalLight&&hasCasters){
      const lightPosition=new THREE.Vector3().setFromMatrixPosition(light.matrixWorld);
      const targetPosition=new THREE.Vector3().setFromMatrixPosition(light.target.matrixWorld);
      const direction=targetPosition.sub(lightPosition).normalize();
      // Directional translation has no photometric effect; move the shadow camera
      // in front of all casters so translated/tall models never fall behind near.
      if(direction.lengthSq()>0){
        light.matrix.setPosition(center.clone().addScaledVector(direction,-diameter));
        light.matrix.decompose(light.position,light.quaternion,light.scale);
        light.target.position.copy(center);light.target.updateMatrixWorld(true);light.updateMatrixWorld(true);
      }
      shadow.updateMatrices(light);
      const inLight=casters.clone().applyMatrix4(shadow.camera.matrixWorldInverse);
      const extent=new THREE.Vector3();inLight.getSize(extent);
      const margin=Math.max(0.001,Math.max(extent.x,extent.y)*0.05);
      const camera=shadow.camera;
      camera.left=inLight.min.x-margin;camera.right=inLight.max.x+margin;
      camera.bottom=inLight.min.y-margin;camera.top=inLight.max.y+margin;
      camera.near=Math.max(0.0001,-inLight.max.z-margin);
      // Receiver-only grounds do not dilute XY resolution. Extra depth retains
      // contact shadows beyond caster bounds without fitting a huge ground plane.
      camera.far=Math.max(camera.near+0.001,-inLight.min.z+diameter*2);
      camera.updateProjectionMatrix();shadow.updateMatrices(light);
      texelSpan=Math.max(camera.right-camera.left,camera.top-camera.bottom)/mapSize;
    }
    shadow.normalBias=Math.min(spatialShadowPolicy.maximumNormalBiasMeters,Math.max(0.000001,texelSpan*spatialShadowPolicy.normalBiasTexels));
    track(shadow);
  }
};`;
}
