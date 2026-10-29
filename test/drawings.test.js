import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DrawingHistory, copyDrawings, drawingGeometry, drawingStyle, draggedDrawing, hitGeometry } from '../public/lib/drawing-model.js';
import { DrawingLayer, TOOLS } from '../public/js/drawings.js';
import { linePrice } from '../public/lib/backtest.js';

const size = { width: 800, height: 600 };
const view = { x: t => t * 10, y: p => 500 - p * 10, fromScreen: (x, y) => ({ time: x / 10, price: (500 - y) / 10 }), logicalOf: t => t, formatPrice: p => p.toFixed(2) };
const make = (type, more = {}) => ({ id: type, type, points: [{time:10,price:20},{time:30,price:30},{time:20,price:10}].slice(0, TOOLS.find(t=>t.id===type).points), ...more });
const near = (a,b) => assert.ok(Math.abs(a-b)<1e-7, `${a} ≠ ${b}`);

for (const tool of TOOLS.filter(t=>t.points)) {
  test(`${tool.label}: has geometry, selectable parts, and movable points`, () => {
    const d=make(tool.id,{text:'A note'}), original=copyDrawings([d]);
    const g=drawingGeometry(d,view,size);
    assert.ok(g.handles.length && g.segments.length+g.labels.length+g.polygons.length);
    const moved=draggedDrawing(d,null,40,-20,view,size);
    assert.deepEqual([d], original);
    for(let i=0;i<d.points.length;i++) {
      near(moved.points[i].time, d.points[i].time+(tool.id==='hline'?0:4));
      near(moved.points[i].price,d.points[i].price+(tool.id==='vline'?0:2));
    }
    const spot=g.segments[0];
    if(spot) assert.ok(hitGeometry(g,(spot.from.x+spot.to.x)/2,(spot.from.y+spot.to.y)/2));
    else assert.ok(hitGeometry(g,g.labels[0].x,g.labels[0].y));
  });
}

test('line reach respects original defaults and custom extensions',()=>{
  assert.equal(hitGeometry(drawingGeometry(make('trend'),view,size),400,150),false);
  assert.equal(hitGeometry(drawingGeometry(make('ray'),view,size),400,150),true);
  assert.equal(hitGeometry(drawingGeometry(make('ray'),view,size),0,350),false);
  assert.equal(hitGeometry(drawingGeometry(make('extended'),view,size),0,350),true);
  assert.equal(hitGeometry(drawingGeometry(make('ray',{extendRight:false,extendLeft:true}),view,size),0,350),true);
  assert.equal(hitGeometry(drawingGeometry(make('ray',{extendRight:false}),view,size),400,150),false);
});

test('selected anchors win hit testing; individual and global locks remove handles',()=>{
  const settings={lockDrawings:false};
  const pane={app:{settings},chart:{timeScale:()=>({width:()=>800}),panes:()=>[{getHeight:()=>600}]}};
  const layer=new DrawingLayer(pane); Object.defineProperty(layer,'projection',{get:()=>view});
  const d=make('trend');layer.setItems([d],{selectedId:d.id});
  assert.equal(layer.hitTestDetailed(100,300).handle.id,'point-0');
  d.locked=true;assert.equal(layer.hitTestDetailed(100,300).handle,null);
  d.locked=false;settings.lockDrawings=true;assert.equal(layer.hitTestDetailed(100,300).handle,null);
  assert.equal(layer.hitTest(200,250),d);
  assert.equal(layer.hitTest(600,550),null);
});

test('every rectangle corner resizes the correct time and price only',()=>{
  const d=make('rect');
  for(const h of drawingGeometry(d,view,size).handles){
    const moved=draggedDrawing(d,h,40,-20,view,size);
    for(let i=0;i<2;i++){
      near(moved.points[i].time,d.points[i].time+(h.xi===i?4:0));
      near(moved.points[i].price,d.points[i].price+(h.yi===i?2:0));
    }
  }
});

test('channel third point changes width without changing the baseline, including vertical channels',()=>{
  const d=make('channel'), g=drawingGeometry(d,view,size), moved=draggedDrawing(d,g.handles[2],0,-20,view,size);
  assert.deepEqual(moved.points.slice(0,2),d.points.slice(0,2));
  near(moved.points[2].price,12);
  d.points[1].time=d.points[0].time;
  const vertical=drawingGeometry(d,view,size);
  assert.ok(vertical.polygons[0].points.every(p=>Number.isFinite(p.x)&&Number.isFinite(p.y)));
});

test('position target, stop and width controls keep entry and risk rules',()=>{
  for(const type of ['long','short']){
    const d=make(type,{rr:2}), g=drawingGeometry(d,view,size), dir=type==='long'?1:-1;
    const target=g.handles.find(h=>h.id==='target');
    const raised=draggedDrawing(d,target,0,-dir*100,view,size);
    near(raised.rr,3);assert.deepEqual(raised.points,d.points);
    const stop=g.handles.find(h=>h.id==='stop');
    const narrowed=draggedDrawing(d,stop,0,-dir*1000,view,size);
    assert.ok(dir*(d.points[0].price-narrowed.points[1].price)>0);
    const wider=draggedDrawing(d,g.handles.find(h=>h.id==='width'),50,100,view,size);
    near(wider.points[1].time,d.points[1].time+5);near(wider.points[1].price,d.points[1].price);
  }
});

test('screen dragging works on logarithmic price scales',()=>{
  const log={...view,y:p=>500-Math.log(p)*100,fromScreen:(x,y)=>({time:x/10,price:Math.exp((500-y)/100)})};
  const d=make('trend'),m=draggedDrawing(d,null,30,20,log,size);
  d.points.forEach((p,i)=>{near(log.x(m.points[i].time)-log.x(p.time),30);near(log.y(m.points[i].price)-log.y(p.price),20);});
});

test('Shift constrains whole movement, snaps line angles, and makes rectangle squares',()=>{
  const d=make('trend');const moved=draggedDrawing(d,null,40,10,view,size,{shift:true});
  near(moved.points[0].price,d.points[0].price);
  const snapped=draggedDrawing(d,{id:'point-1'},100,90,view,size,{shift:true});
  const angle=Math.atan2(view.y(snapped.points[1].price)-view.y(d.points[0].price),view.x(snapped.points[1].time)-view.x(d.points[0].time));
  near(angle/(Math.PI/4),Math.round(angle/(Math.PI/4)));
  const rect=draggedDrawing(make('rect'),{id:'corner-11'},100,20,view,size,{shift:true});
  near(Math.abs(view.x(rect.points[1].time)-view.x(rect.points[0].time)),Math.abs(view.y(rect.points[1].price)-view.y(rect.points[0].price)));
});

test('fill visibility, colours, labels, fib levels, and style survive snapshots',()=>{
  const d=make('fib',{color:'#ff0000',lineWidth:4,lineStyle:'Dotted',locked:true,fibLevels:[0,.5,1],extendLeft:true,text:'Saved',fontSize:16,fillOpacity:33});
  const snapshot=copyDrawings([d]);d.points[0].price=0;d.fibLevels.push(2);
  const restored=JSON.parse(JSON.stringify(snapshot))[0];assert.equal(restored.locked,true);assert.equal(restored.lineWidth,4);assert.deepEqual(restored.fibLevels,[0,.5,1]);
  assert.equal(drawingGeometry(restored,view,size).segments.length,4);
  assert.equal(drawingGeometry(make('rect',{fillEnabled:false}),view,size).polygons.length,0);
  assert.equal(drawingGeometry(make('hline',{showLabels:false}),view,size).labels.length,0);
  assert.equal(drawingStyle(restored).lineStyle,'Dotted');
});

test('history keeps independent edits, reverses deletion, ignores no-ops, clears redo on a new edit, and caps memory',()=>{
  const h=new DrawingHistory(2),a=[make('trend')],b=copyDrawings(a);b[0].locked=true;
  h.record([],a);h.record(a,b);a[0].points[0].price=999;
  assert.equal(h.undo()[0].points[0].price,20);assert.equal(h.redo()[0].locked,true);
  assert.equal(h.record(b,copyDrawings(b)),false);
  h.record(b,[]);assert.equal(h.past.length,2);assert.equal(h.undo()[0].locked,true);
  h.record(b,[make('rect')]);assert.equal(h.redo(),null);
});

test('invalid screen conversions leave coordinates intact',()=>{
  const d=make('trend');assert.deepEqual(draggedDrawing(d,null,1,2,{...view,fromScreen:()=>null},size),d);
  assert.equal(drawingGeometry(d,{...view,x:()=>null},size),null);
});

test('left-only alert extension follows the drawn reach with forward and reversed anchors',()=>{
  const forward=linePrice({t1:100,p1:10,t2:200,p2:20,extend:'left'});
  assert.equal(forward(50),5);assert.equal(forward(200),20);assert.ok(Number.isNaN(forward(201)));
  const reverse=linePrice({t1:200,p1:20,t2:100,p2:10,extend:'left'});
  assert.equal(reverse(250),25);assert.equal(reverse(100),10);assert.ok(Number.isNaN(reverse(99)));
});
