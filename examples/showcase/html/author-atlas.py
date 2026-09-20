from pathlib import Path
import json
root=Path(__file__).parent
scaffold=root/'scaffolds'

def write(name,title,body,script,styles='',profile='plain'):
    source=(scaffold/f'{profile}.html').read_text()
    head=source[:source.index('  <body>')]
    head=head.replace('    <meta name="viewport" content="width=device-width, initial-scale=1">',f'    <meta name="viewport" content="width=device-width, initial-scale=1">\n    <title>{title}</title>')
    text=head+'  <body>\n'+body+'\n<style>\n'+styles+'\n</style>\n<script type="module">\n'+script+'\n</script>\n</body>\n</html>\n'
    (root/f'{name}.html').write_text(text)

def request(name,title,libraries,duration=8000000,params=None,extra=None):
    doc={'kind':'slopcamera.html-scene','schemaVersion':1,'name':title,'document':{'path':f'examples/showcase/html/{name}.html'},'canvas':{'width':1280,'height':720,'deviceScaleFactor':1},'timing':{'durationUs':duration,'fps':24},'libraries':libraries,'seed':20260919,'background':'#11191b','parameters':params or {},'resources':[]}
    if extra:doc.update(extra)
    (root/f'{name}.json').write_text(json.dumps(doc,indent=2)+'\n')

write('kinetic-title','Make every frame count', '''<main class="canvas"><div class="meta"><span>SLOPCAMERA / TITLES</span><span>MOTION · 08 SECONDS</span></div><div class="words"><div class="line"><span>Make every</span></div><div class="line"><span>frame <em>count.</em></span></div></div><div class="rule"></div><div class="strips">'''+''.join(f'<i style="--n:{i}"></i>' for i in range(12))+'''</div><div class="foot"><span>Type. Rhythm. Intention.</span><span>Editable all the way down.</span></div></main>''', '''import {animate} from 'motion';
// Each animation is paused and sought by Slopcamera's absolute clock.
const total=SlopcameraOverlay.durationMs/1000;
document.querySelectorAll('.line span').forEach((el,i)=>SlopcameraOverlay.trackAnimation(animate(el,{transform:['translateY(110%)','translateY(0%)','translateY(0%)','translateY(-110%)'],opacity:[0,1,1,0]},{duration:total,times:[0,.16+i*.055,.78+i*.025,1],ease:['easeOut','linear','easeIn']})));
document.querySelectorAll('.strips i').forEach((el,i)=>SlopcameraOverlay.trackAnimation(animate(el,{transform:['scaleY(.1)','scaleY(1)','scaleY(.55)','scaleY(.1)']},{duration:total,times:[0,.28+i*.018,.66+i*.01,1],ease:'easeInOut'})));
SlopcameraOverlay.trackAnimation(animate('.rule',{transform:['scaleX(0)','scaleX(1)','scaleX(1)','scaleX(0)']},{duration:total,times:[0,.22,.83,1],ease:'easeInOut'}));''', '''.canvas{position:absolute;inset:0;background:#fc693e;color:#211c1a;padding:5.5%;font-family:Arial,Helvetica,sans-serif}.meta,.foot{display:flex;justify-content:space-between;font-size:1.25vw;letter-spacing:.13em}.words{position:absolute;left:5.5%;top:23%;font-size:11.2vw;letter-spacing:-.07em;line-height:1.01;font-weight:600}.line{overflow:hidden;padding:0 .06em}.line span{display:block;transform:translateY(110%)}em{font-family:Georgia,serif;font-weight:400}.rule{position:absolute;top:18%;left:5.5%;right:5.5%;height:1px;background:#402216;transform-origin:left}.foot{position:absolute;left:5.5%;right:5.5%;bottom:6.5%;font-size:1.15vw;letter-spacing:0}.strips{position:absolute;right:6%;bottom:15%;height:10%;width:30%;display:flex;gap:4%}.strips i{display:block;flex:1;background:#211c1a;transform-origin:bottom;transform:scaleY(.1)}''','motion')
request('kinetic-title','Make every frame count',['motion'])

# Keep p5's admitted noLoop/manual-redraw initialization verbatim; replace only artwork.
p5=(scaffold/'p5.html').read_text()
a=p5.index('      const particleCount = 48;');b=p5.index('      let currentFrame',a)
p5=p5[:a]+p5[b:]
a=p5.index('              const { progress, timeMs } = currentFrame;')
b=p5.index('\n            };',a)
p5=p5[:a]+'''              const angle=currentFrame.timeMs/8000*Math.PI*2;
              const w=SlopcameraOverlay.width,h=SlopcameraOverlay.height;
              p.clear();p.resetMatrix();p.blendMode(p.BLEND);p.noFill();
              p.translate(w*.65,h*.50);
              for(let line=0;line<72;line++){
                const r=h*(.105+line*.0045);
                const turn=angle+(line/72)*Math.PI*2;
                p.stroke(line<24?'#f6ad70':line<48?'#ece6d6':'#65bbad');
                p.strokeWeight(1.25);
                p.beginShape();
                for(let j=0;j<=180;j++){
                  const theta=j/180*Math.PI*2;
                  const distortion=1+.17*Math.cos(theta*3+turn)+.045*Math.sin(theta*7-angle);
                  p.vertex(Math.cos(theta)*r*distortion,Math.sin(theta)*r*distortion);
                }
                p.endShape();
              }
''' + p5[b:]
p5=p5.replace('<canvas class="sketch" aria-hidden="true"></canvas>','''<div class="backdrop"></div><canvas class="sketch" aria-hidden="true"></canvas><div class="label"><div class="eyebrow">02 / PROCEDURAL DRAWING</div><h1>Order,<br><em>with a<br>little drift.</em></h1><p>72 contours. One absolute clock.<br>p5 Canvas · authored study</p></div>''')
p5=p5.replace('</head>','''<style>.backdrop{position:absolute;inset:0;background:#112a2b}.sketch{position:absolute;inset:0}.label{position:absolute;left:5.5%;top:8%;color:#ece6d6;font-family:Arial,sans-serif}.eyebrow{font-size:1.15vw;letter-spacing:.16em}h1{font-size:6.4vw;line-height:1;letter-spacing:-.065em;font-weight:500;margin-top:24%}em{font-family:Georgia,serif;font-weight:400}p{font-size:1.3vw;line-height:1.5;opacity:.75;margin-top:23%}</style></head>''')
(root/'contour-drift.html').write_text(p5)
request('contour-drift','Order, with a little drift',['p5'])

# Preserve explicit Two WebGL, context-loss handler and teardown.
two=(scaffold/'two.html').read_text()
a=two.index('      const objectCount = 56;');b=two.index('      const handleContextLoss',a)
two=two[:a]+'''      const w=SlopcameraOverlay.width,h=SlopcameraOverlay.height;
      const cx=w*.60,cy=h*.50;
      const colors=['#e47d50','#315a62','#e6c34e','#8fa49a'];
      const objects=[];
      for(let orbit=0;orbit<5;orbit++){
        const radius=h*(.13+orbit*.060);
        const path=new Two.Ellipse(cx,cy,radius*1.35,radius*.75,96);
        path.noFill();path.stroke='#a49e90';path.linewidth=1;stage.add(path);
        for(let i=0;i<12;i++){
          const shape=new Two.Circle(0,0,i%4===0?11:3.8,24);
          shape.fill=colors[orbit%4];shape.noStroke();stage.add(shape);
          objects.push({shape,radius,phase:i/12*Math.PI*2,orbit});
        }
      }
      const core=new Two.Circle(cx,cy,35,48);core.fill='#202e2e';core.noStroke();stage.add(core);
      const pupil=new Two.Circle(cx,cy,8,24);pupil.fill='#e6c34e';pupil.noStroke();stage.add(pupil);

''' + two[b:]
a=two.index('        const width = SlopcameraOverlay.width;');b=two.index('        two.render();',a)
two=two[:a]+'''        const phase=timeMs/8000*Math.PI*2;
        for(const object of objects){
          const angle=object.phase+phase*(object.orbit%2===0?1:-1);
          object.shape.translation.set(cx+Math.cos(angle)*object.radius*1.35,cy+Math.sin(angle)*object.radius*.75);
          object.shape.scale=1+.16*Math.sin(angle);
        }
''' + two[b:]
two=two.replace('<canvas class="scene" aria-hidden="true"></canvas>','''<div class="backdrop"></div><canvas class="scene" aria-hidden="true"></canvas><div class="header"><span>ORBITAL ASSEMBLY</span><span>03 — TWO.JS / RETAINED VECTOR</span></div><div class="caption"><h1>Many parts.<br><em>One rhythm.</em></h1><p>Sixty elements. Five editable orbits.<br>Every position can be revisited.</p></div><div class="bottom">A geometric motion study, built from editable shapes.</div>''')
two=two.replace('</head>','''<style>.backdrop{position:absolute;inset:0;background:#e9e4d5}.scene{position:absolute;inset:0}.header{position:absolute;top:7%;left:5.5%;right:5.5%;display:flex;justify-content:space-between;font:1.2vw Arial;letter-spacing:.15em;color:#253837}.caption{position:absolute;left:5.5%;bottom:14%;color:#253837}h1{font:500 4.7vw/1.01 Arial;letter-spacing:-.055em;margin:0}h1 em{font-family:Georgia;font-weight:400}p{font:1.15vw/1.5 Arial;margin-top:18%}.bottom{position:absolute;bottom:5%;left:5.5%;font:1.05vw Arial;color:#77766b}</style></head>''')
(root/'orbital-assembly.html').write_text(two)
request('orbital-assembly','Many parts, one rhythm',['two.js'])

paper=(scaffold/'paper-shaders.html').read_text()
paper=paper.replace('const colors = ["#6d5dfc", "#ff67c7", "#56e0d3", "#ffd166"];','const colors = ["#174b53", "#cedba5", "#ed743e", "#d394ce"];')
paper=paper.replace('u_distortion: 0.8','u_distortion: 0.6').replace('u_grainMixer: 0.16','u_grainMixer: 0.09').replace('u_grainOverlay: 0.08','u_grainOverlay: 0.04').replace('u_swirl: 0.35','u_swirl: 0.65')
paper=paper.replace('shader.setFrame(timeMs)','shader.setFrame(3500 + 3000 * Math.sin(timeMs / 8000 * Math.PI * 2))')
paper=paper.replace('<div class="shader" aria-hidden="true"></div>','''<div class="base"></div><div class="shader" aria-hidden="true"></div><div class="head">MATERIAL STUDY / PAPER SHADERS</div><h1>Living<br><em>colour.</em></h1><div class="note">Texture is a direction.<br>Keep the treatment editable.</div><div class="bottom">04 — MESH FIELD · GRAIN · ABSOLUTE TIME</div>''')
paper=paper.replace('</head>','''<style>.base{position:absolute;inset:0;background:#f1eee5}.shader{inset:0!important;border-radius:0!important;filter:none!important}.head,.bottom{position:absolute;left:5.5%;font:1.2vw Arial;letter-spacing:.14em;color:#143337}.head{top:7%}.bottom{bottom:6%}h1{position:absolute;left:5%;top:15%;font:500 12.6vw/.87 Arial;letter-spacing:-.085em;color:#f7f2df;margin:0;text-shadow:0 2px 30px #15383225}h1 em{font:italic 1em Georgia;letter-spacing:-.07em}.note{position:absolute;right:7%;bottom:20%;font:1.5vw/1.4 Arial;color:#f7f2df;text-align:right}</style></head>''')
(root/'living-colour.html').write_text(paper)
request('living-colour','Living colour',['@paper-design/shaders'])

vgpu=(scaffold/'vgpu.html').read_text()
a=vgpu.index('        fn palette(');b=vgpu.index('\n      `;',a)
vgpu=vgpu[:a]+'''        fn palette(v: f32) -> vec3f {
          let ink=vec3f(0.035,0.085,0.14);
          let cyan=vec3f(0.18,0.70,0.75);
          let ember=vec3f(0.98,0.48,0.24);
          return mix(mix(ink,cyan,smoothstep(-1.1,0.1,v)),ember,smoothstep(0.1,1.15,v));
        }
        @fragment fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
          let aspect=params.resolution.x/max(params.resolution.y,1.0);
          let p=(uv-vec2f(0.5))*vec2f(aspect,1.0);
          let a=params.time*0.78539816;
          let one=p-vec2f(-0.32,0.12*sin(a));
          let two=p-vec2f(0.34,-0.12*sin(a));
          let field=sin(length(one)*20.0-a*2.0)+sin(length(two)*20.0+a*2.0);
          let contour=pow(0.5+0.5*cos(field*8.0),18.0);
          let grid=(step(0.978,fract(uv.x*48.0))+step(0.978,fract(uv.y*27.0)))*0.06;
          let color=palette(field*.55)*(0.68+contour*.32)+vec3f(grid);
          return vec4f(color,1.0);
        }
''' + vgpu[b:]
vgpu=vgpu.replace('<canvas class="effect" aria-hidden="true"></canvas>','''<canvas class="effect" aria-hidden="true"></canvas><div class="head"><span>FIELD / 005</span><span>WEBGPU · ONE WGSL PASS</span></div><div class="caption"><h1>Patterns<br>from a program.</h1><p>Two moving sources.<br>An authored interference field.</p></div><div class="scale"><i></i><span>ANALYTIC STUDY / NOT A PHYSICAL SIMULATION</span></div>''')
vgpu=vgpu.replace('</head>','''<style>.head{position:absolute;left:5.5%;right:5.5%;top:7%;display:flex;justify-content:space-between;color:#e6ede7;font:1.2vw Arial;letter-spacing:.15em}.caption{position:absolute;left:5.5%;bottom:17%;color:#f1eee0;text-shadow:0 2px 24px #001225}h1{font:500 5.5vw/.98 Arial;letter-spacing:-.06em;margin:0}p{font:1.25vw/1.5 Arial}.scale{position:absolute;bottom:6%;left:5.5%;display:flex;align-items:center;gap:16px;color:#deece9;font:1vw Arial;letter-spacing:.12em}.scale i{width:90px;height:3px;background:linear-gradient(90deg,#268892,#fa7843)}</style></head>''')
(root/'interference-field.html').write_text(vgpu)
request('interference-field','Patterns from a program',['vgpu'])

write('lower-third','An editable transparent lower third','''<div class="lower"><div class="rule"></div><div class="text"><strong>Built from a living source.</strong><span>CHANGE THE WORDS. KEEP THE TIMING.</span></div><div class="index">06</div></div>''','''const lower=document.querySelector('.lower');
const copy=SlopcameraOverlay.parameters;
document.querySelector('strong').textContent=copy.title ?? 'Built from a living source.';
document.querySelector('.text span').textContent=copy.subtitle ?? 'CHANGE THE WORDS. KEEP THE TIMING.';
document.querySelector('.index').textContent=copy.index ?? '06';
SlopcameraOverlay.onFrame(({timeMs})=>{const t=timeMs/1000;const rise=Math.min(1,t/.8);const fall=Math.min(1,(6-t)/.8);const reveal=Math.max(0,Math.min(rise,fall));const ease=1-Math.pow(1-reveal,3);lower.style.opacity=String(ease);lower.style.transform=`translateY(${24*(1-ease)}px)`;});''','''.lower{position:absolute;left:5.5%;right:5.5%;bottom:9%;display:flex;gap:2.2%;align-items:center;color:#f4f1e6;font-family:Arial,sans-serif;opacity:0}.rule{height:5.2vw;width:.55vw;background:#e3ee7e}.text{flex:1;text-shadow:0 2px 10px #0008}strong{font-size:3.0vw;font-weight:500;letter-spacing:-.04em}span{display:block;font-size:1.05vw;letter-spacing:.16em;margin-top:1vw}.index{font-size:3.7vw;letter-spacing:-.06em;border:1px solid #ffffff65;border-radius:100%;width:6vw;height:6vw;display:grid;place-items:center}''')
request('lower-third','An editable transparent lower third',[],6000000,extra={'background':'#24494c'})
revision=json.loads((root/'editorial.json').read_text());revision['name']='Form follows your idea — revised';revision['parameters']={'variant':'revision','accent':'#ffa775'}
(root/'editorial-revised.json').write_text(json.dumps(revision,indent=2)+'\n')

island=(Path('examples/html/music-video.html')).read_text()
island=island.replace('Island Pulse — procedural music video','Island Pulse — one original phrase')
island=island.replace('bpm: 88.88','bpm: 120')
island=island.replace('Math.floor(beat / 16)','Math.floor(beat / 4)').replace('mod(beat / 16, 1)','mod(beat / 4, 1)')
island=island.replace('TAU * smooth(12, 16, mod(beat, 32))','TAU * smooth(12, 16, mod(beat, 16))')
island=island.replace('const morph = smooth(0.1, 0.72, journey);','const morph = 0.5 - 0.5 * Math.cos(TAU * journey);').replace('const night = smooth(0.28, 0.97, journey);','const night = 0.5 - 0.5 * Math.cos(TAU * journey);')
island=island.replace('landscape.time.value = seconds;','landscape.time.value = 4 * Math.sin(TAU * journey);')
island=island.replace('sun.position.set(-8 + 1.2 * journey, 6.2 - 4.8 * journey, -22);','sun.position.set(-8 + 1.2 * morph, 6.2 - 4.8 * night, -22);').replace('sun.scale.setScalar(1.5 - 0.12 * journey);','sun.scale.setScalar(1.5 - 0.12 * night);')
island=island.replace('seconds * 0.45 + phase','TAU * journey + phase').replace('barPosition / 16','barPosition / 4').replace('barPosition / 12','barPosition / 4')
(root/'island-pulse.html').write_text(island)
request('island-pulse','Island Pulse — one original phrase',['three'],params={'music':{'bpm':120,'beatOffsetUs':0,'beatsPerBar':4}},extra={'executionProfile':'three-webgl2-hardware-v1','audio':{'path':'artifacts/showcase/html/island-pulse.wav'}})
print('Authored 7 profiles plus a revision and transparent lower third.')
