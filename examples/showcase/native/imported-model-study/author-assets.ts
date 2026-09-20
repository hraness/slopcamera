/** Original carton geometry and path artwork. This authoring tool never starts a native engine. */
import { createHash } from "node:crypto";
import { lstat, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const directory = dirname(fileURLToPath(import.meta.url));
const [mode, ...rest] = process.argv.slice(2);
if (!new Set(["--write", "--check"]).has(mode ?? "") || rest.length) {
  throw Error("Usage: bun examples/showcase/native/imported-model-study/author-assets.ts <--write|--check>");
}
const sha256 = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
const ivory = "#eee7d4", teal = "#133c3d", orange = "#d66c40", pale = "#a9b5a1";
// These simple geometric letter/number paths are original, not a font dependency.
const glyphs: Record<string, string> = {
  F: "M0 100V0H62V15H17V43H54V58H17V100Z",
  I: "M0 0H18V100H0Z",
  E: "M0 100V0H62V15H17V42H54V57H17V85H62V100Z",
  L: "M0 0H17V85H62V100H0Z",
  D: "M0 0H28C77 0 77 100 28 100H0ZM17 15V85H28C54 85 54 15 28 15Z",
  "0": "M32 0C-11 0-11 100 32 100C75 100 75 0 32 0ZM32 16C53 16 53 84 32 84C11 84 11 16 32 16Z",
  "1": "M7 22L28 0H45V100H27V26L17 36Z",
};
const widths: Record<string, number> = { F: 62, I: 18, E: 62, L: 62, D: 65, "0": 65, "1": 50 };
function word(text: string, x: number, y: number, height: number, color: string, tracking = 9): string {
  let cursor = 0;
  const paths = [...text].map(char => {
    const path = `<path transform="translate(${cursor} 0)" d="${glyphs[char]}"/>`;
    cursor += widths[char]! + tracking;
    return path;
  }).join("");
  return `<g fill="${color}" fill-rule="evenodd" transform="translate(${x} ${y}) scale(${height / 100})">${paths}</g>`;
}
const rect = (x: number, y: number, width: number, height: number, fill: string) =>
  `<rect x="${x}" y="${y}" width="${width}" height="${height}" fill="${fill}"/>`;
type Vec3 = readonly [number, number, number];
const faces: { name: string; rectangle: readonly [number, number, number, number]; positions: readonly Vec3[]; normal: Vec3 }[] = [
  { name: "front", rectangle: [32, 32, 592, 992], normal: [0, 0, 1], positions: [[-.035,0,.0225],[.035,0,.0225],[.035,.12,.0225],[-.035,.12,.0225]] },
  { name: "right", rectangle: [624,32,984,992], normal: [1,0,0], positions: [[.035,0,.0225],[.035,0,-.0225],[.035,.12,-.0225],[.035,.12,.0225]] },
  { name: "back", rectangle: [1016,32,1576,992], normal: [0,0,-1], positions: [[.035,0,-.0225],[-.035,0,-.0225],[-.035,.12,-.0225],[.035,.12,-.0225]] },
  { name: "left", rectangle: [1608,32,1968,992], normal: [-1,0,0], positions: [[-.035,0,-.0225],[-.035,0,.0225],[-.035,.12,.0225],[-.035,.12,-.0225]] },
  { name: "top", rectangle: [32,1056,592,1416], normal: [0,1,0], positions: [[-.035,.12,.0225],[.035,.12,.0225],[.035,.12,-.0225],[-.035,.12,-.0225]] },
  { name: "bottom", rectangle: [624,1056,1184,1416], normal: [0,-1,0], positions: [[-.035,0,-.0225],[.035,0,-.0225],[.035,0,.0225],[-.035,0,.0225]] },
];
const panels: string[] = [rect(0, 0, 2048, 2048, ivory)];
// Artwork continues into the gutters; UV islands only sample the inset face rectangles.
for (const [index, face] of faces.entries()) {
  const [l,t,r,b] = face.rectangle, w=r-l, h=b-t;
  const fill = index===1||index===3 ? teal : ivory;
  panels.push(rect(l-12,t-12,w+24,h+24,fill));
  if (index < 4) {
    panels.push(rect(l-12,t+690,w+24,32,orange));
    panels.push(rect(l-12,t+732,w+24,6,index===1||index===3 ? pale : teal));
  }
  if (index===0) {
    panels.push(word("FIELD",l+45,t+70,142,teal,8));
    panels.push(rect(l+48,t+240,462,3,teal));
    panels.push(word("01",l+50,t+305,180,teal));
    // A restrained original contour motif, clipped by its own face island.
    for(let line=0;line<7;line++) {
      const y=t+825+line*13;
      panels.push(`<path d="M${l+48} ${y}C${l+185} ${y-76} ${l+300} ${y+52} ${r-48} ${y-22}" fill="none" stroke="${teal}" stroke-width="3"/>`);
    }
    panels.push(rect(r-104,t+358,54,54,orange));
  } else if(index===1) {
    panels.push(word("01",l+47,t+105,220,ivory));
    for(let n=0;n<4;n++)panels.push(rect(l+48,t+423+n*42,w-96,3,pale));
    panels.push(`<circle cx="${l+76}" cy="${t+830}" r="27" fill="${orange}"/>`);
  } else if(index===2) {
    panels.push(word("01",l+49,t+76,152,teal));
    for(let n=0;n<4;n++)panels.push(rect(l+48,t+305+n*65,w-96,28,teal));
    for(let n=0;n<6;n++)panels.push(rect(l+48+n*76,t+808,76,76,n%2===0?teal:orange));
  } else if(index===3) {
    panels.push(word("FIELD",l+53,t+175,76,ivory,8));
    panels.push(rect(l+54,t+350,w-108,5,ivory));
    panels.push(word("01",l+58,t+430,128,ivory));
  } else if(index===4) {
    panels.push(word("01",l+42,t+63,172,teal));
    panels.push(rect(l+46,t+286,w-92,5,teal));
    panels.push(`<circle cx="${r-83}" cy="${t+89}" r="35" fill="${orange}"/>`);
    panels.push(rect(r-123,t+170,77,9,orange));
  } else {
    panels.push(rect(l+45,t+60,36,h-120,teal));
    panels.push(rect(l+100,t+60,16,h-120,orange));
    panels.push(word("01",l+189,t+89,155,teal));
  }
}
const svg = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="2048" height="2048" viewBox="0 0 2048 2048">${panels.join("")}</svg>\n`);
if (svg.length>64*1024 || /<(?:text|image|script|filter)\b|href=|url\(/u.test(svg.toString())) throw Error("Artwork escaped the closed path profile");
const png = await sharp(svg, {limitInputPixels:2048*2048}).removeAlpha().toColourspace("srgb").png({compressionLevel:9, adaptiveFiltering:false}).toBuffer();
const raw = await sharp(png).removeAlpha().raw().toBuffer({resolveWithObject:true});
if(raw.info.width!==2048||raw.info.height!==2048||raw.info.channels!==3)throw Error("Texture profile mismatch");
const positions:number[]=[],normals:number[]=[],uvs:number[]=[],indices:number[]=[];
for(const [i,face] of faces.entries()) {
  const [l,t,r,b]=face.rectangle, u0=(l+.5)/2048,u1=(r-.5)/2048,v0=(t+.5)/2048,v1=(b-.5)/2048;
  positions.push(...face.positions.flat());
  for(let j=0;j<4;j++)normals.push(...face.normal);
  // glTF's top-left image origin: bottom-left model corner samples the island bottom.
  uvs.push(u0,v1,u1,v1,u1,v0,u0,v0);
  indices.push(i*4,i*4+1,i*4+2,i*4,i*4+2,i*4+3);
}
const f32=(values:number[])=>{const b=Buffer.alloc(values.length*4);values.forEach((v,i)=>b.writeFloatLE(v,i*4));return b;};
const u16=(values:number[])=>{const b=Buffer.alloc(values.length*2);values.forEach((v,i)=>b.writeUInt16LE(v,i*2));return b;};
const binaryParts:Buffer[]=[],bufferViews:{buffer:number;byteOffset:number;byteLength:number;target?:number}[]=[];
let offset=0;
for(const [index,part] of [f32(positions),f32(normals),f32(uvs),u16(indices),png].entries()) {
  bufferViews.push({buffer:0,byteOffset:offset,byteLength:part.length,...(index<3?{target:34962}:index===3?{target:34963}:{})});
  const pad=Buffer.alloc((4-part.length%4)%4);binaryParts.push(part,pad);offset+=part.length+pad.length;
}
const binary=Buffer.concat(binaryParts);
const document={asset:{version:"2.0",generator:"Slopcamera original FIELD carton v1"},scene:0,
 scenes:[{nodes:[0]}],nodes:[{name:"FieldCarton",mesh:0}],
 meshes:[{name:"FieldCarton",primitives:[{attributes:{POSITION:0,NORMAL:1,TEXCOORD_0:2},indices:3,material:0,mode:4}]}],
 buffers:[{byteLength:binary.length}],bufferViews,
 accessors:[{bufferView:0,componentType:5126,count:24,type:"VEC3",min:[-.035,0,-.0225],max:[.035,.12,.0225]},
 {bufferView:1,componentType:5126,count:24,type:"VEC3"},{bufferView:2,componentType:5126,count:24,type:"VEC2"},
 {bufferView:3,componentType:5123,count:36,type:"SCALAR",min:[0],max:[23]}],
 materials:[{name:"FIELD printed matte paper",alphaMode:"OPAQUE",doubleSided:false,pbrMetallicRoughness:{baseColorFactor:[1,1,1,1],baseColorTexture:{index:0,texCoord:0},metallicFactor:0,roughnessFactor:.62}}],
 textures:[{sampler:0,source:0}],samplers:[{magFilter:9729,minFilter:9729,wrapS:33071,wrapT:33071}],images:[{name:"FIELD label atlas",bufferView:4,mimeType:"image/png"}]};
const json=Buffer.from(JSON.stringify(document)),jsonPad=Buffer.alloc((4-json.length%4)%4,32),jsonChunk=Buffer.concat([json,jsonPad]);
const header=Buffer.alloc(20);header.write("glTF");header.writeUInt32LE(2,4);header.writeUInt32LE(28+jsonChunk.length+binary.length,8);header.writeUInt32LE(jsonChunk.length,12);header.writeUInt32LE(0x4e4f534a,16);
const binHeader=Buffer.alloc(8);binHeader.writeUInt32LE(binary.length,0);binHeader.writeUInt32LE(0x004e4942,4);
const glb=Buffer.concat([header,jsonChunk,binHeader,binary]);
const facts={kind:"slopcamera.showcase.imported-model-assets",schemaVersion:1,
 original:{name:"FIELD / 01",purpose:"Original packaging mockup; not a manufactured product or print proof",license:"MIT",source:"Original vector paths and geometric arrays in author-assets.ts; no external fonts or image assets"},
 authoring:{tool:"Sharp",version:sharp.versions.sharp,vips:sharp.versions.vips,generatorSha256:sha256(await readFile(fileURLToPath(import.meta.url)))},
 model:{path:"assets/field-carton.glb",bytes:glb.length,sha256:sha256(glb),mesh:"FieldCarton",vertices:24,triangles:12,units:"meters",upAxis:"y",bounds:{minimum:[-.035,0,-.0225],maximum:[.035,.12,.0225]},blenderBounds:{minimum:[-.035,-.0225,0],maximum:[.035,.0225,.12]},dimensionsMeters:[.07,.045,.12],boundToleranceMeters:.000002,uvTolerance:.000001,externalDependencies:[]},
 texture:{path:"textures/field-label.png",bytes:png.length,sha256:sha256(png),width:2048,height:2048,channels:3,colorSpace:"srgb",decodedRgbSha256:sha256(raw.data)},
 artwork:{path:"artwork.svg",bytes:svg.length,sha256:sha256(svg)},
 faces:faces.map((face,index)=>({...face,indices:indices.slice(index*6,index*6+6),uvs:uvs.slice(index*8,index*8+8)})),
 views:[{frame:0,name:"hero",parentYawDegrees:0},{frame:1,name:"right",parentYawDegrees:-55},{frame:2,name:"back",parentYawDegrees:180}]};
const outputs:Record<string,Buffer>={"artwork.svg":svg,"textures/field-label.png":png,"assets/field-carton.glb":glb,"asset-facts.json":Buffer.from(JSON.stringify(facts,null,2)+"\n")};
if(Object.values(outputs).reduce((sum,bytes)=>sum+bytes.length,0)>3*1024**2)throw Error("Generated assets exceed their 3 MiB share of the 4 MiB source budget");
for(const [path,bytes] of Object.entries(outputs)) {
  const physical=join(directory,path);
  for(const parent of [directory,dirname(physical)])if(!(await lstat(parent)).isDirectory()||(await lstat(parent)).isSymbolicLink())throw Error("Physical source directories required");
  try {const entry=await lstat(physical);if(!entry.isFile()||entry.isSymbolicLink()||entry.nlink!==1)throw Error("Generated output is not an owned regular file");} catch(error) {if((error as NodeJS.ErrnoException).code!=="ENOENT")throw error;}
  if(mode==="--check") {if(!(await readFile(physical)).equals(bytes))throw Error("Reproduction differs: "+path);}
  else await writeFile(physical,bytes);
}
console.log(JSON.stringify({status:mode==="--check"?"authored-assets-reproduced":"authored-assets-written",nativeExecution:false,files:Object.entries(outputs).map(([path,bytes])=>({path,bytes:bytes.length,sha256:sha256(bytes)}))},null,2));
