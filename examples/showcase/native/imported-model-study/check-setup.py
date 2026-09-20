"""Pure regression evidence; extracts only reviewed functions and never imports bpy."""
import ast
import hashlib
import json
from pathlib import Path
from types import SimpleNamespace as NS

HERE = Path(__file__).resolve().parent
SOURCE = HERE

def extracted(path, name, namespace):
    tree = ast.parse(path.read_text())
    functions = [node for node in tree.body if isinstance(node, ast.FunctionDef) and node.name == name]
    assert len(functions) == 1
    exec(compile(ast.Module(body=functions, type_ignores=[]), str(path), "exec"), namespace)
    return namespace[name]

clear = extracted(SOURCE / "scene.py", "clear_empty_startup_sequencer", {})
results = []

class Scene:
    def __init__(self, editor, completes=True):
        self.sequence_editor = editor
        self.calls = 0
        self.completes = completes
    def sequence_editor_clear(self):
        self.calls += 1
        if self.completes:
            self.sequence_editor = None

def accepted(name, editor, expected_calls):
    scene = Scene(editor)
    assert clear(scene) is None
    assert scene.sequence_editor is None and scene.calls == expected_calls
    results.append({"case":name,"passed":True})

def rejected(name, editor, message, missing_clear=False, completes=True):
    scene = Scene(editor, completes)
    if missing_clear:
        scene.sequence_editor_clear = None
    original_editor = scene.sequence_editor
    original_fields = vars(editor).copy() if editor is not None else {}
    try:
        clear(scene)
    except ValueError as error:
        assert str(error) == message
    else:
        raise AssertionError("Unexpected clear admission: " + name)
    assert scene.sequence_editor is original_editor
    assert vars(editor) == original_fields
    assert scene.calls == (0 if completes else 1)
    results.append({"case":name,"passed":True,"rejected":message})

accepted("No editor performs no clear", None, 0)
accepted("Modern empty editor clears exactly once", NS(strips=[], strips_all=[]), 1)
accepted("Legacy empty editor clears exactly once", NS(sequences=[], sequences_all=[]), 1)
for prefix, names in [("Modern", ("strips", "strips_all")), ("Legacy", ("sequences", "sequences_all"))]:
    rejected(prefix + " nonempty top-level content is preserved", NS(**{names[0]:[object()], names[1]:[]}), "Unexpected nonempty startup sequencer")
    rejected(prefix + " nonempty recursive content is preserved", NS(**{names[0]:[], names[1]:[object()]}), "Unexpected nonempty startup sequencer")
    rejected(prefix + " missing recursive API is preserved", NS(**{names[0]:[]}), "Unsupported startup sequencer API")
    rejected(prefix + " missing top-level API is preserved", NS(**{names[1]:[]}), "Unsupported startup sequencer API")
rejected("Unknown collection API is preserved", NS(), "Unsupported startup sequencer API")
rejected("Partial modern API cannot fall through to legacy", NS(strips=[], sequences=[], sequences_all=[]), "Unsupported startup sequencer API")
rejected("Missing clear function preserves the empty editor", NS(strips=[], strips_all=[]), "Unsupported startup sequencer clear API", missing_clear=True)
rejected("Clear must remove the editor", NS(strips=[], strips_all=[]), "Startup sequencer did not clear", completes=False)

image = object()
scene = NS(sequence_editor=None, compositing_node_group=None)
data = NS(**{name:[] for name in ["libraries","volumes","movieclips","sounds","texts","objects","meshes","materials","scenes","worlds","cameras","lights"]}, images=[image])
closure = extracted(SOURCE / "scene_checks.py", "closure", {"bpy":NS(data=data, context=NS(scene=scene))})
assert closure(image)["externalDependencies"] == []
results.append({"case":"Unchanged closure accepts no sequencer/compositor","passed":True})
for field in ["sequence_editor", "compositing_node_group"]:
    setattr(scene, field, NS())
    try:
        closure(image)
    except ValueError as error:
        assert str(error) == "Unexpected sequencer or compositor dependency"
    else:
        raise AssertionError("Strict closure stopped rejecting " + field)
    setattr(scene, field, None)
    results.append({"case":"Unchanged closure rejects reintroduced " + field,"passed":True})

scene_tree = ast.parse((SOURCE / "scene.py").read_text())
build = next(node for node in scene_tree.body if isinstance(node, ast.FunctionDef) and node.name == "build")
reset_index = next(i for i,node in enumerate(build.body) if isinstance(node, ast.Assign) and isinstance(node.value, ast.Call) and isinstance(node.value.func, ast.Name) and node.value.func.id == "reset")
call = build.body[reset_index+1]
assert isinstance(call,ast.Expr) and isinstance(call.value,ast.Call) and isinstance(call.value.func,ast.Name) and call.value.func.id == "clear_empty_startup_sequencer"
assert len(call.value.args)==1 and isinstance(call.value.args[0],ast.Name) and call.value.args[0].id=="scene"
results.append({"case":"Setup runs immediately after reset before GLB import","passed":True})

record = {"kind":"n3-sequencer-setup-pure-validation", "cases":results,"passed":len(results),"failed":0,
    "nativeExecuted":False,"bpyImported":False,
    "sourceFiles":[{"path":name,"sha256":hashlib.sha256((SOURCE/name).read_bytes()).hexdigest()} for name in ["scene.py","scene_checks.py"]]}
class ModernScene:
    sequence_editor = None
    compositing_node_group = None
    @property
    def use_nodes(self):
        raise AssertionError("Deprecated compositor switch must not be read")

for name, candidate, rejection in [
    ("modern unassigned switch is not read", ModernScene(), None),
    ("modern assigned tree", NS(sequence_editor=None, compositing_node_group=object()), "Unexpected sequencer or compositor dependency"),
    ("modern falsey disabled tree", NS(sequence_editor=None, compositing_node_group=[], use_nodes=False), "Unexpected sequencer or compositor dependency"),
    ("modern falsey sequencer", NS(sequence_editor=[], compositing_node_group=None), "Unexpected sequencer or compositor dependency"),
    ("legacy unassigned tree", NS(sequence_editor=None, node_tree=None), None),
    ("legacy assigned tree", NS(sequence_editor=None, node_tree=object()), "Unexpected sequencer or compositor dependency"),
    ("legacy sequencer", NS(sequence_editor=object(), node_tree=None), "Unexpected sequencer or compositor dependency"),
    ("unknown compositor API", NS(sequence_editor=None), "Unsupported scene compositor API"),
]:
    guarded = extracted(SOURCE / "scene_checks.py", "closure", {"bpy":NS(data=data, context=NS(scene=candidate))})
    try:
        guarded(image)
    except ValueError as error:
        assert rejection is not None and str(error) == rejection
    else:
        assert rejection is None, name
    results.append({"case":name,"passed":True})
print(json.dumps({"passed":len(results),"failed":0,"nativeExecuted":False}))
