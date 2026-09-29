# Token-savings benchmark summary

Generated 2026-09-29T17:54:16.562Z. Spent $5.69 across 32 recorded steps and 0 aborted steps.

## Medians over successful sessions (create and revise both passed)

| Task | Cond | Sessions | Passed | Out create | Out revise | Out total | $ create | $ revise | $ total | In-side total | Turns total | Wall s total |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| t1 | A | 2 | 2 | 2,072 | 1,606 | 3,678 | 0.13 | 0.12 | 0.25 | 139,100 | 16 | 47 |
| t1 | B | 2 | 2 | 2,269 | 1,106 | 3,375 | 0.22 | 0.09 | 0.31 | 273,902 | 21 | 62 |
| t2 | A | 2 | 2 | 3,580 | 1,126 | 4,706 | 0.16 | 0.05 | 0.21 | 113,649 | 11 | 63 |
| t2 | B | 2 | 2 | 5,583 | 1,935 | 7,518 | 0.43 | 0.15 | 0.57 | 605,039 | 27 | 693 |
| t3 | A | 2 | 2 | 10,097 | 1,399 | 11,496 | 0.42 | 0.09 | 0.52 | 358,521 | 19 | 340 |
| t3 | B | 2 | 2 | 6,722 | 1,973 | 8,695 | 0.46 | 0.13 | 0.59 | 563,063 | 24 | 223 |
| t4 | A | 2 | 2 | 2,528 | 992 | 3,519 | 0.14 | 0.04 | 0.18 | 107,755 | 14 | 44 |
| t4 | B | 2 | 2 | 2,077 | 1,132 | 3,209 | 0.15 | 0.06 | 0.21 | 148,447 | 13 | 44 |

## B / A ratio of medians (below 1 means SlopCamera used less)

| Task | Passed A | Passed B | Out create | Out revise | Out total | $ create | $ revise | $ total |
|---|---|---|---|---|---|---|---|---|
| t1 | 2 | 2 | 1.09 | 0.69 | 0.92 | 1.69 | 0.76 | 1.23 |
| t2 | 2 | 2 | 1.56 | 1.72 | 1.60 | 2.60 | 2.98 | 2.69 |
| t3 | 2 | 2 | 0.67 | 1.41 | 0.76 | 1.07 | 1.43 | 1.14 |
| t4 | 2 | 2 | 0.82 | 1.14 | 0.91 | 1.11 | 1.56 | 1.21 |

## Per-session create plus revise totals

With two sessions per cell a median is the mean of two sessions, so the ranges matter more than the medians.

| Session | Pass | Out | $ | In-side | Wall s | API s | Outside API s | slopcamera cmds | Skill loaded |
|---|---|---|---|---|---|---|---|---|---|
| t1-A-r1 | yes | 3,303 | 0.202 | 110,791 | 38 | 33 | 5 | 0 | – |
| t1-A-r2 | yes | 4,052 | 0.301 | 167,409 | 56 | 51 | 4 | 0 | – |
| t1-B-r1 | yes | 3,346 | 0.320 | 279,971 | 65 | 50 | 15 | 5 | yes |
| t1-B-r2 | yes | 3,403 | 0.299 | 267,833 | 60 | 39 | 20 | 5 | yes |
| t2-A-r1 | yes | 5,183 | 0.223 | 118,606 | 78 | 55 | 23 | 0 | – |
| t2-A-r2 | yes | 4,228 | 0.203 | 108,691 | 48 | 41 | 7 | 0 | – |
| t2-B-r1 | yes | 9,259 | 0.780 | 897,786 | 851 | 94 | 758 | 8 | yes |
| t2-B-r2 | yes | 5,776 | 0.365 | 312,292 | 534 | 60 | 474 | 6 | yes |
| t3-A-r1 | yes | 12,798 | 0.565 | 392,232 | 324 | 121 | 203 | 0 | – |
| t3-A-r2 | yes | 10,193 | 0.473 | 324,809 | 356 | 95 | 261 | 0 | – |
| t3-B-r1 | yes | 8,502 | 0.579 | 570,592 | 245 | 87 | 157 | 7 | yes |
| t3-B-r2 | yes | 8,887 | 0.602 | 555,533 | 202 | 101 | 102 | 7 | yes |
| t4-A-r1 | yes | 3,739 | 0.195 | 119,404 | 46 | 39 | 7 | 0 | – |
| t4-A-r2 | yes | 3,299 | 0.158 | 96,106 | 42 | 33 | 8 | 0 | – |
| t4-B-r1 | yes | 2,904 | 0.187 | 119,739 | 42 | 31 | 11 | 0 | no |
| t4-B-r2 | yes | 3,513 | 0.242 | 177,155 | 46 | 35 | 11 | 1 | yes |

## Per-session ranges, A versus B

| Task | Out A | Out B | Output | $ A | $ B | Cost |
|---|---|---|---|---|---|---|
| t1 | 3,303–4,052 | 3,346–3,403 | ranges overlap | 0.202–0.301 | 0.299–0.320 | ranges overlap |
| t2 | 4,228–5,183 | 5,776–9,259 | B higher, ranges do not overlap | 0.203–0.223 | 0.365–0.780 | B higher, ranges do not overlap |
| t3 | 10,193–12,798 | 8,502–8,887 | B lower, ranges do not overlap | 0.473–0.565 | 0.579–0.602 | B higher, ranges do not overlap |
| t4 | 3,299–3,739 | 2,904–3,513 | ranges overlap | 0.158–0.195 | 0.187–0.242 | ranges overlap |

## Cost by token type, all steps

Prices per million tokens: input $4, cache write $8, cache read $0.2, output $20. They reproduce every step's reported cost to within $0.000000.

| Cond | Steps | Input tok | Cache write tok | Cache read tok | Output tok | $ input | $ cache write | $ cache read | $ output | $ total |
|---|---|---|---|---|---|---|---|---|---|---|
| A | 16 | 168 | 140,647 | 1,297,233 | 46,795 | 0.001 | 1.125 | 0.259 | 0.936 | 2.32 |
| B | 16 | 256 | 233,794 | 2,946,851 | 45,590 | 0.001 | 1.870 | 0.589 | 0.912 | 3.37 |

Prompts identical across conditions and repeats for every task and step: yes.

## Failures

None.

## All steps

| Key | Step | Status | Pass | In-side | Out | $ | Turns | Wall s | slopcamera cmds | Skill calls | Tools |
|---|---|---|---|---|---|---|---|---|---|---|---|
| t1-A-r1 | create | ok | yes | 56,760 | 2,144 | 0.13 | 8 | 24 | 0 | 0 | Read×3 Bash×2 |
| t1-A-r1 | revise | ok | yes | 54,031 | 1,159 | 0.07 | 6 | 14 | 0 | 0 | Bash×1 Read×2 |
| t1-A-r2 | create | ok | yes | 56,845 | 2,000 | 0.13 | 6 | 26 | 0 | 0 | Bash×3 Read×2 |
| t1-A-r2 | revise | ok | yes | 110,564 | 2,052 | 0.17 | 12 | 30 | 0 | 0 | Bash×3 Read×6 |
| t1-B-r1 | create | ok | yes | 166,579 | 2,324 | 0.22 | 14 | 44 | 4 | 1 | Bash×7 Skill×1 Read×2 |
| t1-B-r1 | revise | ok | yes | 113,392 | 1,022 | 0.10 | 7 | 20 | 1 | 0 | Bash×2 Read×2 |
| t1-B-r2 | create | ok | yes | 165,712 | 2,213 | 0.21 | 14 | 39 | 4 | 1 | Bash×7 Skill×1 Read×2 |
| t1-B-r2 | revise | ok | yes | 102,121 | 1,190 | 0.09 | 7 | 21 | 1 | 0 | Bash×2 Read×2 |
| t2-A-r1 | create | ok | yes | 83,279 | 4,286 | 0.18 | 9 | 58 | 0 | 0 | Bash×6 Read×2 |
| t2-A-r1 | revise | ok | yes | 35,327 | 897 | 0.04 | 3 | 19 | 0 | 0 | Bash×1 Read×1 |
| t2-A-r2 | create | ok | yes | 73,674 | 2,873 | 0.15 | 7 | 33 | 0 | 0 | Bash×5 Read×1 |
| t2-A-r2 | revise | ok | yes | 35,017 | 1,355 | 0.05 | 3 | 15 | 0 | 0 | Bash×1 Read×1 |
| t2-B-r1 | create | ok | yes | 574,027 | 7,125 | 0.57 | 26 | 573 | 6 | 1 | Read×10 Bash×11 Skill×1 Write×2 |
| t2-B-r1 | revise | ok | yes | 323,759 | 2,134 | 0.21 | 7 | 278 | 2 | 0 | Read×4 Bash×2 |
| t2-B-r2 | create | ok | yes | 226,975 | 4,040 | 0.28 | 15 | 316 | 4 | 1 | Bash×10 Skill×1 Read×2 |
| t2-B-r2 | revise | ok | yes | 85,317 | 1,736 | 0.08 | 5 | 219 | 2 | 0 | Bash×2 Read×2 |
| t3-A-r1 | create | ok | yes | 229,934 | 11,105 | 0.46 | 14 | 252 | 0 | 0 | Read×4 Bash×5 Write×1 Edit×3 |
| t3-A-r1 | revise | ok | yes | 162,298 | 1,693 | 0.11 | 8 | 72 | 0 | 0 | Grep×1 Read×2 Edit×3 Bash×1 |
| t3-A-r2 | create | ok | yes | 205,379 | 9,088 | 0.39 | 12 | 271 | 0 | 0 | Bash×6 Write×1 Edit×1 Read×3 |
| t3-A-r2 | revise | ok | yes | 119,430 | 1,105 | 0.08 | 4 | 85 | 0 | 0 | Grep×1 Bash×1 Read×1 |
| t3-B-r1 | create | ok | yes | 365,695 | 6,635 | 0.44 | 18 | 185 | 6 | 1 | Read×5 Bash×9 Skill×1 Write×1 |
| t3-B-r1 | revise | ok | yes | 204,897 | 1,867 | 0.14 | 5 | 60 | 1 | 0 | Read×2 Bash×2 |
| t3-B-r2 | create | ok | yes | 378,475 | 6,808 | 0.47 | 20 | 155 | 6 | 1 | Read×4 Bash×11 Skill×1 Write×1 Edit×1 |
| t3-B-r2 | revise | ok | yes | 177,058 | 2,079 | 0.13 | 4 | 47 | 1 | 0 | Bash×2 Read×1 |
| t4-A-r1 | create | ok | yes | 83,610 | 2,754 | 0.15 | 12 | 34 | 0 | 0 | Read×6 Bash×5 |
| t4-A-r1 | revise | ok | yes | 35,794 | 985 | 0.04 | 3 | 13 | 0 | 0 | Bash×1 Read×1 |
| t4-A-r2 | create | ok | yes | 66,297 | 2,301 | 0.12 | 9 | 29 | 0 | 0 | Read×4 Bash×4 |
| t4-A-r2 | revise | ok | yes | 29,809 | 998 | 0.04 | 3 | 13 | 0 | 0 | Bash×1 Read×1 |
| t4-B-r1 | create | ok | yes | 68,127 | 1,740 | 0.12 | 8 | 25 | 0 | 0 | Read×3 Bash×4 |
| t4-B-r1 | revise | ok | yes | 51,612 | 1,164 | 0.07 | 4 | 17 | 0 | 0 | Bash×1 Read×2 |
| t4-B-r2 | create | ok | yes | 109,467 | 2,413 | 0.18 | 11 | 31 | 1 | 1 | Read×3 Bash×5 Skill×1 |
| t4-B-r2 | revise | ok | yes | 67,688 | 1,100 | 0.06 | 3 | 16 | 0 | 0 | Bash×1 Read×1 |
