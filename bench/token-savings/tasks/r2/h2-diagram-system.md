# H2 diagram system

## TASK.md

# Architecture diagram set

Draw this system as one architecture diagram titled "Platform Architecture",
with 12 nodes in 3 labelled groups:

| Group | Colour | Nodes |
|---|---|---|
| Edge | `#2F80ED` | CDN, Load Balancer, API Gateway, Auth |
| Services | `#27AE60` | Users, Orders, Payments, Search |
| Data | `#F2994A` | Postgres, Redis, Event Bus, Object Store |

Arrows:

- CDN → Load Balancer
- Load Balancer → API Gateway
- API Gateway → Auth
- API Gateway → Users
- API Gateway → Orders
- API Gateway → Search
- Orders → Payments
- Users → Postgres
- Orders → Postgres
- Payments → Event Bus
- Search → Redis
- Orders → Object Store

Deliverables, all showing the same diagram and visually consistent (same
layout logic, fonts and group colours; the dark versions use a dark
background):

- `out/arch-light.svg` and `out/arch-dark.svg`
- `out/arch-light.png` and `out/arch-dark.png`, each 1920x1080
- `out/arch-social.png`, 1080x1080, light theme, a square re-layout for
  social media that still shows the title and all 12 nodes

## Create prompt

Do the task described in TASK.md in the current directory. When the deliverables are written, reply with one line per output file.

## Revision 1

Revision: rename the "Orders" node to "Checkout" in every deliverable. Keep everything else the same and re-export all five files to the same paths. When done, reply with one line per output file.

## Revision 2

Revision: change the "Data" group colour from #F2994A to #7B61FF in every deliverable. Keep everything else the same and re-export all five files to the same paths. When done, reply with one line per output file.

## Revision 3

Revision: add a 13th node, "Rate Limiter", to the "Edge" group. Replace the arrow Load Balancer → API Gateway with Load Balancer → Rate Limiter → API Gateway. Keep everything else the same and re-export all five files to the same paths. When done, reply with one line per output file.

## Revision 4

The project in this folder was made earlier; make this change and re-render. Change: the social version becomes 4:5 portrait instead of square, so `out/arch-social.png` is 1080x1350, re-laid out to fit, still light theme with the title and every node. Leave the other four files as they are. When done, reply with one line per output file.

## Revision 5

The project in this folder was made earlier; make this change and re-render. Change: rename the "Edge" group to "Gateway Tier" in every deliverable, and re-export all five files to the same paths. When done, reply with one line per output file.
