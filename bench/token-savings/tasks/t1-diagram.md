# T1 diagram

## TASK.md

# Architecture diagram

Make an architecture flow diagram with exactly these five nodes and four
directed edges:

- Nodes: "Web Client", "API Gateway", "Auth Service", "Order Service",
  "Database".
- Edges: Web Client → API Gateway, API Gateway → Auth Service,
  API Gateway → Order Service, Order Service → Database.

Export it in a light theme and a dark theme, each as SVG and as PNG, to these
exact paths:

- `out/diagram-light.svg`
- `out/diagram-dark.svg`
- `out/diagram-light.png`
- `out/diagram-dark.png`

Every node label must be readable in all four files.

## Create prompt

Do the task described in TASK.md in the current directory. When the deliverables are written, reply with one line per output file.

## Revise prompt

Revision: rename the "Order Service" node to "Checkout Service" and add a directed edge from "Auth Service" to "Database". Keep everything else the same and re-export all four files to the same paths. When done, reply with one line per output file.
