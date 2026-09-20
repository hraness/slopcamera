// Asset adaptation, not a parser relaxation. glTF 2.0 §3.6.2.3:
// https://registry.khronos.org/glTF/specs/2.0/glTF-2.0.html#sparse-accessors
import { createHash } from 'node:crypto'
const sha=(bytes:Uint8Array)=>createHash('sha256').update(bytes).digest('hex')
function need(ok:unknown,message:string):asserts ok{if(!ok)throw new Error(message)}
export function denseGlb(input:Buffer){
 need(input.length<16*1024*1024&&input.readUInt32LE(0)===0x46546c67&&input.readUInt32LE(4)===2&&input.readUInt32LE(8)===input.length,'GLB header/size')
 const jsonLength=input.readUInt32LE(12),binHeader=20+jsonLength
 need(input.readUInt32LE(16)===0x4e4f534a&&input.readUInt32LE(binHeader+4)===0x004e4942,'Only JSON and BIN')
 const doc=JSON.parse(input.subarray(20,binHeader).toString('utf8')),bin=input.subarray(binHeader+8)
 need(bin.length===input.readUInt32LE(binHeader)&&doc.buffers.length===1&&!doc.buffers[0].uri,'Embedded single buffer')
 need(doc.buffers[0].byteLength<=bin.length&&bin.length-doc.buffers[0].byteLength<4,'BIN length')
 need(Array.isArray(doc.accessors)&&doc.accessors.length<=4096&&Array.isArray(doc.bufferViews)&&doc.bufferViews.length<=4096,'Accessor/view count bound')
 const componentSizes:Record<number,number>={5120:1,5121:1,5122:2,5123:2,5125:4,5126:4},componentCounts:Record<string,number>={SCALAR:1,VEC2:2,VEC3:3,VEC4:4,MAT4:16}
 let decodedBytes=0
 for(const a of doc.accessors){const bytes=componentSizes[a.componentType],components=componentCounts[a.type];need(bytes&&components&&Number.isSafeInteger(a.count)&&a.count>0&&a.count<=300000,'Bounded supported accessor');decodedBytes+=bytes*components*a.count;need(decodedBytes<=32*1024*1024,'Expanded accessor byte budget')}
 const original=structuredClone(doc),source=bin.subarray(0,doc.buffers[0].byteLength)
 function elements(d:any,a:any,data:Buffer){
  const bytes=({5120:1,5121:1,5122:2,5123:2,5125:4,5126:4} as any)[a.componentType],components=({SCALAR:1,VEC2:2,VEC3:3,VEC4:4,MAT4:16} as any)[a.type]
  need(bytes&&components&&Number.isSafeInteger(a.count)&&a.count>0&&a.count<=300000,'Bounded supported accessor (matrix padding excluded)')
  const size=bytes*components,out=Buffer.alloc(a.count*size)
  function region(v:number,offset:number,length:number){const view=d.bufferViews[v];need(view&&view.buffer===0,'Buffer view');need(Number.isSafeInteger(offset)&&offset>=0&&offset+length<=view.byteLength,'View range');const start=(view.byteOffset??0)+offset;need(start+length<=data.length,'Buffer range');return data.subarray(start,start+length)}
  if(a.bufferView!==undefined){const v=d.bufferViews[a.bufferView],stride=v.byteStride??size;need(stride>=size&&stride%bytes===0,'Stride');for(let i=0;i<a.count;i++)region(a.bufferView,(a.byteOffset??0)+i*stride,size).copy(out,i*size)}
  if(a.sparse){const s=a.sparse;need(Number.isInteger(s.count)&&s.count>0&&s.count<=a.count,'Sparse count');const ib=({5121:1,5123:2,5125:4} as any)[s.indices.componentType];need(ib,'Sparse unsigned index type');need(!d.bufferViews[s.indices.bufferView].byteStride&&!d.bufferViews[s.values.bufferView].byteStride,'Sparse tightly packed');const indices=region(s.indices.bufferView,s.indices.byteOffset??0,s.count*ib),values=region(s.values.bufferView,s.values.byteOffset??0,s.count*size);let last=-1;for(let i=0;i<s.count;i++){const index=indices.readUIntLE(i*ib,ib);need(index>last&&index<a.count,'Sparse strictly increasing index');values.copy(out,index*size,i*size,(i+1)*size);last=index}}
  return out
 }
 const chunks=[source],proof:any[]=[];let length=source.length
 for(let index=0;index<doc.accessors.length;index++){
  const accessor=doc.accessors[index];if(!accessor.sparse)continue
  const expanded=elements(original,original.accessors[index],source),padding=(4-length%4)%4
  if(padding){chunks.push(Buffer.alloc(padding));length+=padding}
  const bufferView=doc.bufferViews.length;doc.bufferViews.push({buffer:0,byteOffset:length,byteLength:expanded.length})
  chunks.push(expanded);length+=expanded.length;accessor.bufferView=bufferView;accessor.byteOffset=0;delete accessor.sparse
  proof.push({accessor:index,expandedSha256:sha(expanded),bytes:expanded.length})
 }
 const dense=Buffer.concat(chunks);doc.buffers[0].byteLength=dense.length
 for(let i=0;i<doc.accessors.length;i++)need(elements(original,original.accessors[i],source).equals(elements(doc,doc.accessors[i],dense)),'Semantic accessor mismatch '+i)
 const json=Buffer.from(JSON.stringify(doc)),jsonPadded=Buffer.concat([json,Buffer.alloc((4-json.length%4)%4,0x20)]),binPadded=Buffer.concat([dense,Buffer.alloc((4-dense.length%4)%4)])
 const header=Buffer.alloc(20);header.writeUInt32LE(0x46546c67,0);header.writeUInt32LE(2,4);header.writeUInt32LE(28+jsonPadded.length+binPadded.length,8);header.writeUInt32LE(jsonPadded.length,12);header.writeUInt32LE(0x4e4f534a,16)
 const bh=Buffer.alloc(8);bh.writeUInt32LE(binPadded.length,0);bh.writeUInt32LE(0x004e4942,4)
 const bytes=Buffer.concat([header,jsonPadded,bh,binPadded])
 return{bytes,document:doc,proof:{operation:'expand-sparse-accessors-v1',specification:'https://registry.khronos.org/glTF/specs/2.0/glTF-2.0.html#sparse-accessors',input:{bytes:input.length,sha256:sha(input)},output:{bytes:bytes.length,sha256:sha(bytes)},changedAccessors:proof,allAccessorBytesEqual:true,comparedAccessors:doc.accessors.length}}
}
