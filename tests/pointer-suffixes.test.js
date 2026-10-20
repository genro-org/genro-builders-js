import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {BagCbResolver} from '@genrojs/bag';
import {HtmlBuilder, pointerTransform, pointerDependencies, pointerExpression, sourceBagToTytx, sourceBagFromTytx} from '../src/index.js';

const cases=JSON.parse(fs.readFileSync(new URL('./fixtures/pointer-suffixes.json',import.meta.url)));
for(const entry of cases) test(`shared suffix contract: ${entry.name}`,()=>{
    const b=new HtmlBuilder();
    for(const [key,value] of Object.entries(entry.data)) b.data.setItem(key,value);
    const node=b.root.div(null,entry.attrs);
    const before={...node.getAttr()};
    if(entry.error) assert.throws(()=>b.runtimeValues(node),new RegExp(entry.error));
    else assert.deepEqual(b.runtimeValues(node)[1],entry.expected);
    assert.deepEqual(node.getAttr(),before);
    for(const [key,value] of Object.entries(entry.data)) assert.equal(b.data.getItem(key),value);
});

test('paths and dependencies remain current after updates and rebinding',()=>{
    const b=new HtmlBuilder();b.data.setItem('record.w',7,{unit:'px'});b.data.setItem('record.h',8);
    const node=b.root.div(null,{datapath:'record',nodeId:'anchor'}).div(null,{width:'^.w:{}px',height:'^#anchor.h:{width}:{}',unit:'=.w?unit:{}'});
    assert.equal(node.absDatapath('^#anchor.w?unit:Unit: {}'),'record.w?unit');
    assert.equal(node.absDatapath('^.child.#parent.w:{}'),'record.w');
    assert.deepEqual(b.runtimeValues(node)[1],{width:'7px',height:'7px:8',unit:'px'});
    assert.deepEqual(node.pointers(),[['width','^.w'],['height','^#anchor.h']]);
    assert.deepEqual(pointerDependencies(node,node.getAttr('height')),new Set(['width']));
    b.data.setItem('record.w',9);assert.equal(b.runtimeValues(node)[1].height,'9px:8');
    node.setAttr({width:'^.h:{}em'});assert.equal(b.runtimeValues(node)[1].height,'8em:8');
    assert.deepEqual(pointerDependencies(node,'${width}'),new Set());
    assert.equal(node.pointerType('==false'),null);
    assert.equal(pointerTransform('==a:b'),null);
    assert.deepEqual(pointerTransform('=a:Customer: {}'),{pointer:'=a',expression:false,body:'Customer: {}'});
    node.setAttr({width:'^.h:{height}'});
    assert.throws(()=>pointerDependencies(node,node.getAttr('height')), /Cyclic/);
});

test('resolvers read once; their output and expression results are never interpreted as pointers',()=>{
    const b=new HtmlBuilder();b.data.setItem('v',1);let calls=0;
    const node=b.root.div(null,{a:new BagCbResolver(()=>{calls++;return '=literal';},{cacheTime:0}),title:'^v:{a}',other:'^v:{title}'});
    assert.deepEqual(b.runtimeValues(node)[1],{a:'=literal',title:'=literal',other:'=literal'});
    assert.equal(calls,1);
});

test('consumer expression hook receives typed inputs and owns execution',()=>{
    // Only this test consumer compiles JavaScript; the library never uses Function/eval.
    class Runtime extends HtmlBuilder {
        evaluatePointerExpression(node,name,raw,expression,inputs) {
            this.last={node,name,raw,inputs};
            return new Function('_pointerValues','_F',`return (${expression.text}\n)`)(inputs,(value,opts)=>opts.mask.replace('{}',value.toFixed(2)));
        }
    }
    const b=new Runtime(); b.data.setItem('w',4);b.data.setItem('h',3);b.data.setItem('draft',false);b.data.setItem('empty',null);
    const node=b.root.div(null,{width:'^w',height:'^h:={} * {width}',disabled:'^draft:=!{}',nullable:'^empty:={} === null',title:"^w:=_F({}, {pattern: '0.00', mask: '{} €'})"});
    assert.deepEqual(b.runtimeValues(node)[1],{width:4,height:12,disabled:true,nullable:true,title:'4.00 €'});
    const value="'; throw new Error('injected'); //"; b.data.setItem('w',value);
    const stringNode=b.root.div(null,{title:'^w:={}'});
    assert.equal(b.runtimeValues(stringNode)[1].title,value);assert.equal(b.last.inputs[0],value);
    const staticBuilder=new HtmlBuilder(); staticBuilder.data.setItem('v',false);
    assert.equal(staticBuilder.runtimeValues(staticBuilder.root.div(null,{title:'^v:=!{}'}))[1].title,null);
});

test('lexical slots ignore strings, comments, regexes and entire template literals',()=>{
    const source=`_F({}, {pattern: '0.00', mask: '{} €'}) + /{regex}/.source /* {comment} */ + "{literal}" + {width}`;
    const parsed=pointerExpression(source);
    assert.deepEqual(parsed.slots,['','width']);
    assert(parsed.text.includes("mask: '{} €'"));assert(parsed.text.includes('/{regex}/'));
    assert.deepEqual(pointerExpression('({} / 2) + /[{}]/.test("{") + `literal {x}`').slots,['']);
    assert.deepEqual(pointerExpression('{} // {comment}\n + {other}').slots,['','other']);
    const b=new HtmlBuilder();const node=b.root.div(null,{title:'^v:='+source,width:3});
    b.runtimeValues(node);
    const restored=sourceBagFromTytx(sourceBagToTytx(b.source),b);
    assert.equal(restored.getNodes()[0].getAttr('title'),'^v:='+source);
});


test('named Source metadata is read without adding it to projection',()=>{
    const b=new HtmlBuilder();b.data.setItem('v',3);
    const node=b.root.div(null,{nodeId:'ref',title:'^v:{nodeId}:{}'});
    assert.deepEqual(b.runtimeValues(node)[1],{title:'ref:3'});
});

test('a consumer follows transitive inputs, rebinds and disposes using base dependency discovery',()=>{
    const b=new HtmlBuilder(); b.data.setItem('w',2); b.data.setItem('h',3);b.data.setItem('other',9);
    const node=b.root.div(null,{width:'^w:{}px',title:'^h:{width}:{}'});
    let paths,output,updates=0;
    const refresh=()=>{output=b.runtimeValues(node)[1].title;updates++;};
    const bind=()=>{
        const names=new Set(['title',...pointerDependencies(node,node.getAttr('title'))]);
        paths=new Set(node.pointers().filter(([name])=>names.has(name)).map(([,path])=>node.absDatapath(path)));
        refresh();
    };
    b._dataroot.subscribe('suffix-consumer',{any: event=>{
        if(paths.has(event.pathlist.slice(1).join('.'))) refresh();
    }});
    bind();assert.equal(output,'2px:3');
    b.data.setItem('w',4);assert.equal(output,'4px:3');
    node.setAttr({width:'^other:{}em'});bind();assert.equal(output,'9em:3');
    let count=updates;b.data.setItem('w',5);assert.equal(updates,count);
    b.data.setItem('other',7);assert.equal(output,'7em:3');
    b._dataroot.unsubscribe('suffix-consumer',{any:true});
    count=updates;b.data.setItem('h',8);assert.equal(updates,count);
});
