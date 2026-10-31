"""Rebuild icons/slime-icons.js from tools/icons.py.

The icons are drawn as 24x24 round 2.5px strokes; Home Assistant icon packs need filled
outlines, so each stroke is outlined with Skia and merged.

    pip install skia-python svgelements
    python tools/build_icons.py
"""
import skia, svgelements, json, sys, os
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from icons import ICONS, ROTATE

def segments(d):
    """Each drawn segment as its own little open skia path."""
    out = []
    start = cur = None
    for seg in svgelements.Path(d).segments():
        t = type(seg).__name__
        if t == 'Move':
            start = cur = seg.end; continue
        p = skia.Path(); p.moveTo(cur.x, cur.y)
        if t == 'Line': p.lineTo(seg.end.x, seg.end.y)
        elif t == 'Close':
            if abs(cur.x - start.x) < 1e-6 and abs(cur.y - start.y) < 1e-6: continue
            p.lineTo(start.x, start.y)
        elif t == 'CubicBezier': p.cubicTo(seg.control1.x, seg.control1.y, seg.control2.x, seg.control2.y, seg.end.x, seg.end.y)
        elif t == 'QuadraticBezier': p.quadTo(seg.control.x, seg.control.y, seg.end.x, seg.end.y)
        elif t == 'Arc':
            for c in seg.as_cubic_curves():
                p.cubicTo(c.control1.x, c.control1.y, c.control2.x, c.control2.y, c.end.x, c.end.y)
        out.append(p)
        cur = start if t == 'Close' else seg.end
    return out

def outline(d, rots=()):
    segs = segments(d)
    for a in rots:
        for sp in list(segments(d)):
            sp.transform(skia.Matrix.RotateDeg(a, (12, 12))); segs.append(sp)
    paint = skia.Paint(Style=skia.Paint.kStroke_Style, StrokeWidth=2.5,
                       StrokeCap=skia.Paint.kRound_Cap, StrokeJoin=skia.Paint.kRound_Join)
    b = skia.OpBuilder()
    for sp in segs:
        f = skia.Path(); paint.getFillPath(sp, f)
        b.add(skia.Simplify(f), skia.PathOp.kUnion_PathOp)
    r = b.resolve()
    return orient(r)

def contours(p):
    cs = []; cur = None
    it = skia.Path.Iter(p, False)
    while True:
        verb, pts = it.next()
        if verb == skia.Path.kDone_Verb: break
        if verb == skia.Path.kMove_Verb:
            cur = skia.Path(); cs.append(cur); cur.moveTo(pts[0])
        elif verb == skia.Path.kLine_Verb: cur.lineTo(pts[1])
        elif verb == skia.Path.kQuad_Verb: cur.quadTo(pts[1], pts[2])
        elif verb == skia.Path.kConic_Verb: cur.conicTo(pts[1], pts[2], it.conicWeight())
        elif verb == skia.Path.kCubic_Verb: cur.cubicTo(pts[1], pts[2], pts[3])
        elif verb == skia.Path.kClose_Verb: cur.close()
    return cs

def area(c):
    pts = c.getPoints(c.countPoints())
    return sum(pts[i].x()*pts[(i+1)%len(pts)].y() - pts[(i+1)%len(pts)].x()*pts[i].y() for i in range(len(pts))) / 2

def orient(p):
    cs = [c for c in contours(p) if c.countPoints() > 2]
    out = skia.Path()
    for i, c in enumerate(cs):
        pt = c.getPoint(0)
        depth = 0
        for j, o in enumerate(cs):
            if i == j: continue
            o2 = skia.Path(o); o2.setFillType(skia.PathFillType.kWinding)
            b = o.getBounds(); cb = c.getBounds()
            if b.contains(cb) and o2.contains(cb.centerX(), cb.centerY()) and abs(area(o)) > abs(area(c)):
                depth += 1
        want_pos = (depth % 2 == 0)
        if (area(c) > 0) == want_pos: out.addPath(c)
        else: out.reverseAddPath(c)
    return out

def to_d(p):
    f = lambda v: ('%.2f' % v).rstrip('0').rstrip('.')
    parts = []
    it = skia.Path.Iter(p, False)
    while True:
        verb, pts = it.next()
        if verb == skia.Path.kDone_Verb: break
        if verb == skia.Path.kMove_Verb: parts.append('M%s %s' % (f(pts[0].x()), f(pts[0].y())))
        elif verb == skia.Path.kLine_Verb: parts.append('L%s %s' % (f(pts[1].x()), f(pts[1].y())))
        elif verb in (skia.Path.kQuad_Verb, skia.Path.kConic_Verb): parts.append('Q%s %s %s %s' % (f(pts[1].x()), f(pts[1].y()), f(pts[2].x()), f(pts[2].y())))
        elif verb == skia.Path.kCubic_Verb: parts.append('C' + ' '.join(f(v) for pt in pts[1:4] for v in (pt.x(), pt.y())))
        elif verb == skia.Path.kClose_Verb: parts.append('Z')
    return ''.join(parts)

paths = {n: to_d(outline(d, ROTATE.get(n, ()))) for n, d in ICONS.items()}
js = ("// Slime Time cartoon icon pack - use as slime:<name>, e.g. slime:bulb\n"
      "(() => {\n  const P = " + json.dumps(paths, separators=(',', ':')) + ";\n"
      "  window.customIcons = window.customIcons || {};\n"
      "  window.customIcons['slime'] = {\n"
      "    getIcon: async (name) => ({ path: P[name] || '', viewBox: '0 0 24 24' }),\n"
      "    getIconList: async () => Object.keys(P).map((name) => ({ name })),\n"
      "  };\n  window.dispatchEvent(new Event('custom-icons-updated'));\n})();\n")
out = os.path.join(HERE, '..', 'icons', 'slime-icons.js')
open(out, 'w', newline='\n').write(js)
print('wrote', os.path.normpath(out), '-', len(paths), 'icons')
