# Cate — © 2026 R.S. Alle Rechte vorbehalten.
# Dieser Code ist geistiges Eigentum von R.S. Vervielfältigung, Weitergabe oder
# Nutzung ohne ausdrückliche schriftliche Erlaubnis von R.S. ist untersagt.
# Generates assets/catFrames.js: the shared 32x24 pixel cat (desktop pet + Greeting).
#   python scripts/make-cat.py
# o outline  w fur  g shade  e eye  h shine  p pink  n nose  c collar  y bell  t tongue  k sparkle  z sleep-z
import json, math
W, H = 32, 24

def ell(cx, cy, rx, ry):
    return {(x, y) for x in range(W) for y in range(H) if ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1}
def tri(a, b, c):
    def s(p, q, r): return (p[0]-r[0])*(q[1]-r[1])-(q[0]-r[0])*(p[1]-r[1])
    out = set()
    for x in range(W):
        for y in range(H):
            p = (x + .5, y + .5); d = [s(p,a,b), s(p,b,c), s(p,c,a)]
            if not (any(v < 0 for v in d) and any(v > 0 for v in d)): out.add((x, y))
    return out
def rect(x0, y0, x1, y1): return {(x, y) for x in range(x0, x1 + 1) for y in range(y0, y1 + 1)}
def path(pts, r=1.0):
    out = set()
    for (x0, y0), (x1, y1) in zip(pts, pts[1:]):
        for i in range(21):
            cx, cy = x0 + (x1 - x0) * i / 20, y0 + (y1 - y0) * i / 20
            out |= {(x, y) for x in range(W) for y in range(H) if (x - cx) ** 2 + (y - cy) ** 2 <= r * r}
    return out

def build(pose, step=0, tail=0):
    layers = []  # (cells, color)
    if pose == "sit":
        hx, hy = 21, 9
        body = ell(13, 17, 9, 7) | ell(10, 19, 8, 5)
        legs = rect(16, 15, 19, 23) | rect(15, 22, 21, 23)
        far = rect(12, 21, 14, 23) | rect(3, 22, 12, 23)
        tl = [[(4, 23), (1, 22), (0, 19), (1, 16), (3, 14)], [(4, 23), (1, 22), (0, 20), (2, 18), (5, 18)]][tail]
        layers = [(path(tl, 1.1), "g"), (far, "g"), (body, "w"), (legs, "w")]
    else:
        hx, hy = 22, 8
        body = ell(13, 13, 10, 5)
        a, b = (0, 1) if step == 0 else (1, 0)
        def leg(x, up): return rect(x, 16, x + 2, 21 if up else 23)
        legs = leg(22 - 3 * a, a) | leg(7 + 2 * a, a)
        far = leg(18 + 3 * b, b) | leg(11 - 2 * b, b)
        tl = [[(3, 11), (1, 8), (1, 4), (2, 2)], [(3, 11), (0, 9), (0, 6), (1, 3)]][tail]
        layers = [(path(tl, 1.1), "g"), (far, "g"), (body, "w"), (legs, "w")]
    head = ell(hx, hy, 7.5, 6)
    ears = tri((hx - 7, hy - 8), (hx - 7, hy - 2), (hx - 2, hy - 5)) | tri((hx + 7, hy - 8), (hx + 7, hy - 2), (hx + 2, hy - 5))
    layers.append((head | ears, "w"))
    grid = {}
    for cells, c in layers:
        for p in cells: grid[p] = c
    for (x, y) in list(grid):  # lower belly / back shade
        if grid[(x, y)] == "w" and ((pose == "sit" and y > 20 and x < 14) or (pose == "stand" and y > 15 and (x, y) in body)): grid[(x, y)] = "g"
    filled = set(grid)
    for x in range(W):
        for y in range(H):
            if (x, y) not in filled and any(((x+dx, y+dy) in filled) for dx, dy in ((1,0),(-1,0),(0,1),(0,-1))): grid[(x, y)] = "o"
    def put(cells, c):
        for p in cells:
            if p in grid and grid[p] != "o": grid[p] = c
    # collar + bell
    put({(x, y) for x in range(W) for y in (hy + 4, hy + 5) if (x, y) in grid and hx - 5 <= x <= hx + 4}, "c")
    put({(hx - 1, hy + 6)}, "y")
    put({(hx - 5, hy - 4), (hx - 4, hy - 4), (hx - 4, hy - 3), (hx + 5, hy - 4), (hx + 4, hy - 4), (hx + 4, hy - 3)}, "p")
    put({(hx - 6, hy + 2), (hx + 5, hy + 2)}, "p")
    put({(hx, hy + 2), (hx - 1, hy + 2)}, "n")
    return grid, hx, hy

def eyes(grid, hx, hy, mode):
    L, R = hx - 4, hx + 2
    for ex in (L, R):
        if mode == "open":
            for dx, dy, c in ((0, 0, "h"), (1, 0, "e"), (0, 1, "e"), (1, 1, "e")): grid[(ex + dx, hy - 1 + dy)] = c
        else:  # closed: happy arc
            for dx in (0, 1): grid[(ex + dx, hy)] = "o"

def render(grid):
    return ["".join(grid.get((x, y), ".") for x in range(W)) for y in range(H)]

def paw(grid, hx, hy, up):
    # far front paw lifted to the cheek/mouth (a rounded white blob with outline)
    cx, cy = hx - 2, hy + (3 if up else 4)
    blob = ell(cx, cy, 2.4, 2.9)
    for p in blob: grid[p] = "w"
    for (x, y) in {(x + dx, y + dy) for x, y in blob for dx, dy in ((1,0),(-1,0),(0,1),(0,-1))} - blob: grid[(x, y)] = "o"
    grid[(cx - 1, cy + 1)] = "g"; grid[(cx + 1, cy + 1)] = "g"  # toe beans lines

F = {}
for name, pose, kw in (("sit", "sit", {}), ("sitTail", "sit", {"tail": 1}), ("walkA", "stand", {"step": 0}), ("walkB", "stand", {"step": 1, "tail": 1})):
    g, hx, hy = build(pose, **kw); eyes(g, hx, hy, "open"); F[name] = render(g)
    if pose == "sit":
        g2, _, _ = build(pose, **kw); eyes(g2, hx, hy, "shut"); F[name + "Blink"] = render(g2)
for i, up in enumerate((False, True)):
    g, hx, hy = build("sit", tail=i); eyes(g, hx, hy, "shut"); paw(g, hx, hy, up)
    g[(hx + 1, hy + 3)] = "t"; g[(hx + 1, hy + 4 - i)] = "t"
    g[(hx + 7, hy - 7)] = "k" if i else "."
    F["groom" + "AB"[i]] = render(g)
g, hx, hy = build("sit"); eyes(g, hx, hy, "shut"); g[(hx + 8, hy - 8)] = "z"; F["sleep"] = render(g)


# ---- props: wicker basket (front lip, cat naps behind it) and a hopping bunny (own sizes)
def prop(cells, W2, H2):
    g = {}
    for p, c in cells.items(): g[p] = c
    filled = set(g)
    for x in range(W2):
        for y in range(H2):
            if (x, y) not in filled and any(((x+dx, y+dy) in filled) for dx, dy in ((1,0),(-1,0),(0,1),(0,-1))): g[(x, y)] = "o"
    return ["".join(g.get((x, y), ".") for x in range(W2)) for y in range(H2)]

def basket():
    W2, H2 = 26, 9; c = {}
    for y in range(1, 8):
        inset = max(0, 2 - y) if y < 3 else (max(0, y - 5))
        for x in range(1 + inset, W2 - 1 - inset):
            c[(x, y)] = "u" if (x + y // 2) % 4 == 0 or y in (1, 4) else "r"   # weave
    for x in range(0, W2): c[(x, 0)] = "u"; c[(x, 1)] = "r"                    # rim
    return prop(c, W2, H2)

def animal(shapes, marks, W2, H2):
    """shapes: [(cells, color)]; marks: {(x, y): color} drawn over the outline."""
    c = {}
    for cells, ch in shapes:
        for p in cells: c[p] = ch
    out = [list(r) for r in prop(c, W2, H2)]
    for (x, y), ch in marks.items(): out[y][x] = ch
    return ["".join(r) for r in out]

def E(cx, cy, rx, ry, W2=18, H2=18): return {(x, y) for x in range(W2) for y in range(H2) if ((x-cx)/rx)**2 + ((y-cy)/ry)**2 <= 1}

def bunny(air):
    # sitting bunny in profile (faces right): two tall ears, round body, cotton tail, hind foot; "air" stretches the legs
    W2, H2 = 18, 18; dy = -1 if air else 0
    shapes = [
        (E(11.5, 3.5, 1.5, 3.6), "w"), (E(14.5, 4.5, 1.5, 3.2), "g"),          # ears (far one shaded)
        (E(6.5, 13 + dy, 6, 4.2), "w"), (E(4.5, 14 + dy, 3.5, 3.2), "g"),     # body + haunch
        (E(12.5, 9.5 + dy, 3.8, 3.3), "w"),                                   # head
        (E(1.8, 12.5 + dy, 1.8, 1.8), "w"),                                   # cotton tail
        (rect(9, 15 + dy, 12, 16), "w"), (rect(2, 16, 8, 16), "g")            # front paw, hind foot
    ]
    marks = {(11, 2): "p", (11, 3): "p", (11, 4): "p", (13, 10 + dy): "e", (16, 11 + dy): "n"}
    if air: shapes += [(rect(9, 14, 15, 15), "w")]
    return animal(shapes, marks, W2, H2)

def mouse(step):
    W2, H2 = 16, 9
    shapes = [(E(6.5, 5, 5.5, 3), "g"), (E(12, 5.5, 2.8, 2.2), "g"), (E(10, 1.8, 1.6, 1.6), "p"),
              (path([(0, 6), (-1, 4)] if False else [(1, 6), (0, 4), (0, 2)], 0.5), "p"),
              (rect(4 + step, 8, 5 + step, 8), "g"), (rect(9 - step, 8, 10 - step, 8), "g")]
    return animal(shapes, {(13, 5): "e", (15, 6): "n"}, W2, H2)

def bird(air):
    W2, H2 = 14, 13; dy = -1 if air else 0
    shapes = [(E(6, 6 + dy, 5, 4.2), "w"), (E(9.5, 3.5 + dy, 2.8, 2.6), "w"), (E(4.5, 7 + dy, 3, 2), "g"),
              (rect(11, 4 + dy, 13, 4 + dy), "y"), (rect(0, 7 + dy, 2, 8 + dy), "g"),
              (rect(5, 11, 5, 12), "y"), (rect(8, 11, 8, 12), "y")]
    return animal(shapes, {(10, 3 + dy): "e", (9, 5 + dy): "p"}, W2, H2)

def butterfly(open_):
    W2, H2 = 14, 12
    wing = [(E(4, 4, 3.5, 3.5), "p"), (E(10, 4, 3.5, 3.5), "p"), (E(4.5, 8.5, 2.5, 2.5), "c"), (E(9.5, 8.5, 2.5, 2.5), "c")] if open_         else [(E(7, 4, 2, 4), "p"), (E(7, 8.5, 1.5, 2.5), "c")]
    return animal(wing + [(rect(6, 2, 7, 10), "o")], {}, W2, H2)

for n, f in (("bunny", bunny), ("mouse", mouse), ("bird", bird), ("butterfly", butterfly)):
    F[n + "A"] = f(0 if n != "butterfly" else True); F[n + "B"] = f(1 if n != "butterfly" else False)
F["basket"] = basket()

open("assets/catFrames.js", "w", encoding="utf8").write("// Cate — © 2026 R.S. Alle Rechte vorbehalten. Geistiges Eigentum von R.S.; Nutzung nur mit schriftlicher Erlaubnis von R.S.\n// generated by scripts/make-cat.py\nglobalThis.CAT = " + json.dumps({"w": W, "h": H, "frames": F}, indent=0) + ";\n")
for r in F["groomA"]: print(r)
