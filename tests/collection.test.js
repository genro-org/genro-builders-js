import assert from 'node:assert/strict';
import test from 'node:test';
import {Collection, BuilderBase, HtmlBuilder} from '../src/index.js';
import {grammarDocument as document} from './grammar-fixture.js';
const param=(name, type='str')=>({name, kind:'keyword_only',role:'attribute',
    annotation:{kind:'type',module:'builtins',name:type},has_default:true,default:null});

test('a later collection replaces the named declarations without mutating inputs', () => {
    const original=document('base', {panel:{sub_tags:'leaf[1:2]',doc:'kept',
        attributes:{parameters:[param('title'),param('id')]},_meta:{options:{left:1,right:2}}},leaf:{sub_tags:''}});
    const saved=structuredClone(original);
    const collection=new Collection(original).update(document('extension', {panel:{
        sub_tags:'leaf[1:4],extra',attributes:{parameters:[param('title','int'),param('lbl')]},
        _meta:{options:{left:3}}}, extra:{sub_tags:''}}));
    const result=collection.toDocument(),panel=result.elements.panel;
    assert.equal(panel.doc,undefined);assert.equal(panel.sub_tags,'leaf[1:4],extra');
    assert.deepEqual(panel._meta.options,{left:3});
    assert.deepEqual(panel.attributes.parameters.map(p=>p.name),['title','lbl']);
    assert.deepEqual(result.elements.leaf,{sub_tags:''});
    const builder=new BuilderBase().loadGrammar(result,{replace:true});
    const parent=builder.root.panel({title:2,lbl:'Label'});parent.leaf();parent.extra();
    assert.throws(()=>builder.root.panel({title:'wrong'}),/invalid value/);
    assert.deepEqual(original,saved);
    delete result.elements.panel;assert.ok(collection.toDocument().elements.panel);
});

test('an abstract replacement recompiles its dependents without changing another instance',()=>{
    const initial=document('base',{panel:{inherits_from:'flow'},leaf:{sub_tags:''}},{flow:{sub_tags:'leaf'}});
    const builder=new BuilderBase().loadGrammar(initial,{replace:true});
    builder.loadGrammar(document('extension',{extra:{sub_tags:''}},{flow:{sub_tags:'extra'}}));
    assert.equal(builder.schema.panel.sub_tags,'extra');
    assert.equal(new BuilderBase().loadGrammar(initial,{replace:true}).schema.panel.sub_tags,'leaf');
});

test('HTML inherited declarations accept partial updates',()=>{
    const builder=new HtmlBuilder().loadGrammar(document('application',{div:{doc:'application div',_meta:{feature:'label'}}}));
    assert.equal(builder.root.div('hello').nodeTag,'div');
    assert.equal(builder.schema.div._meta.feature,'label');
    assert.equal(new HtmlBuilder().schema.div._meta?.feature,undefined);
});

test('rejected patch leaves collection and schema unchanged',()=>{
    const builder=new BuilderBase().loadGrammar(document('base',{leaf:{sub_tags:''}}),{replace:true});
    const schema=builder.schema,collection=builder._collection;
    assert.throws(()=>builder.loadGrammar(document('bad',{bad:{inherits_from:'missing'}})),/unknown abstract/);
    assert.strictEqual(builder.schema,schema);assert.strictEqual(builder._collection,collection);
});

test('explicit empty child rules remain values and unknown fields are rejected',()=>{
    const builder=new BuilderBase().loadGrammar(document('base',{panel:{sub_tags:'leaf'},leaf:{}}),{replace:true});
    builder.loadGrammar(document('extension',{panel:{sub_tags:''}}));
    assert.throws(()=>builder.root.panel().leaf(),/not allowed/);
    assert.throws(()=>builder.loadGrammar(document('bad',{leaf:{typo:true}})),/unknown field/);
});

test('successive class JSON loads retain earlier declarations', () => {
    class Dialect extends BuilderBase {}
    Dialect.defineGrammar(document('first',{first:{sub_tags:''}}));
    Dialect.defineGrammar(document('second',{second:{sub_tags:''}}));
    const builder = new Dialect();
    assert.equal(builder.root.first().nodeTag,'first');
    assert.equal(builder.root.second().nodeTag,'second');
});

test('JSON updates preserve executable component declarations',()=>{
    class Page extends HtmlBuilder {
        static components=['badge'];
        badge(root,{text}) {root.span(text);}
        main(root) {root.badge({text:'kept'});}
    }
    const builder=new Page();builder.create();
    builder.loadGrammar(document('extension',{div:{doc:'next'}}));
    assert.equal(builder.render(),'<span>kept</span>');
});

test('a redefined element replaces an existing wildcard',()=>{
    const builder=new BuilderBase().loadGrammar(document('base',{panel:{sub_tags:'*'}}),{replace:true});
    builder.loadGrammar(document('extension',{panel:{sub_tags:'span,p'},span:{},p:{}}));
    assert.equal(builder.schema.panel.sub_tags,'span,p');
    builder.root.panel().span();
    const before=builder._collection.toDocument();
    for(const invalid of ['bad!','span,span']) {
        assert.throws(()=>builder.loadGrammar(document('invalid',{panel:{sub_tags:invalid}})));
        assert.deepEqual(builder._collection.toDocument(),before);
    }
});
