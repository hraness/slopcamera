import ast, copy, json
from pathlib import Path
HERE=Path(__file__).resolve().parent
module=ast.parse((HERE/"inspect.py").read_text())
fn=next(n for n in module.body if isinstance(n,ast.FunctionDef) and n.name=="validate_pose_records")
namespace={};exec(compile(ast.Module(body=[fn],type_ignores=[]),"<extracted-guard>","exec"),namespace)
check=namespace["validate_pose_records"]
views=[{"frame":0,"name":"hero"},{"frame":1,"name":"right"},{"frame":2,"name":"back"}]
cases=[]
def test(name,facts,actual,accepted=False):
 try:check({"views":facts},{"poses":actual});observed=True
 except ValueError:observed=False
 assert observed is accepted,name
 cases.append({"name":name,"accepted":accepted})
test("exact three",views,copy.deepcopy(views),True)
for n in [0,1,2]:test("truncated "+str(n),views,views[:n])
test("extra",views,views+[views[0]])
test("duplicate",views,[views[0],views[0],views[2]])
test("reordered",views,[views[1],views[0],views[2]])
test("wrong name",views,[views[0],{"frame":1,"name":"other"},views[2]])
test("wrong frame",views,[views[0],{"frame":3,"name":"right"},views[2]])
test("boolean frame",views,[views[0],{"frame":True,"name":"right"},views[2]])
test("nonlist",views,{})
test("nondict",views,[views[0],None,views[2]])
test("source truncated",views[:2],views[:2])
test("source wrong frame",[views[0],views[2],views[1]],[views[0],views[2],views[1]])
print(json.dumps({"status":"pure-extracted-pose-guard-passed","cases":cases,"nativeExecuted":False}))
