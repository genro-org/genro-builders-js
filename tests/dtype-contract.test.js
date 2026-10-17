import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {Bag} from '@genrojs/bag';
import {createDecimal,registerType} from '@genrojs/tytx';
import {BuilderBase} from '../src/index.js';

const fixture=JSON.parse(fs.readFileSync(new URL('./fixtures/dtypes.json',import.meta.url)));
const build=(annotation)=>{
    const doc=structuredClone(fixture);
    doc.elements.typed.attributes.parameters=[{name:'value',kind:'keyword_only',role:'attribute',annotation,has_default:false}];
    return new BuilderBase().loadGrammar(doc,{replace:true});
};
const dtype=code=>({kind:'dtype',dtype:code});

test('loads actual Python-exported domain signatures and keeps typed values',()=>{
    const b=new BuilderBase().loadGrammar(fixture,{replace:true});
    const attrs={day:new Date('2026-10-17'),clock:new Date('1970-01-01T09:30:00Z'),stamp:new Date('2026-10-17T09:30:00Z'),amount:createDecimal('9007199254740993.25'),payload:new Uint8Array([1,2]),data:new Bag(),optional:null,dates:[new Date('2026-10-17')]};
    const node=b.setChild(b.source,'typed',null,attrs);
    for(const [key,value] of Object.entries(attrs)) assert.equal(node.getAttr(key),value);
    assert.equal(node.getAttr('amount').toString(),'9007199254740993.25');
});
for(const nested of ['direct','union','list']) test(`dtype rejects invalid values through ${nested}`,()=>{
    for(const [code,invalid] of [['L',true],['L',1.5],['R',Infinity],['N',1.2],['N','1.2'],['D','2026-10-17'],['H',new Date(NaN)],['B',0],['NN',false],['X',{}],['RAW','abc'],['QS',new Date()]]) {
        let desc=dtype(code), value=invalid;
        if(nested==='union') desc={kind:'union',items:[desc,dtype('NN')]};
        if(nested==='list') {desc={kind:'generic',origin:{kind:'type',module:'builtins',name:'list'},arguments:[desc]};value=[invalid];}
        const b=build(desc);
        assert.throws(()=>b.setChild(b.source,'typed',null,{value}),/invalid value/);
    }
});
test('nullability, custom registry identity and malformed descriptors',()=>{
    const b=build({kind:'union',items:[dtype('D'),dtype('NN')]});
    b.setChild(b.source,'typed',null,{value:null});
    class Domain {}
    registerType(Domain,'DTYPECONTRACT',()=>'',()=>new Domain());
    const custom=build(dtype('DTYPECONTRACT'));
    custom.setChild(custom.source,'typed',null,{value:new Domain()});
    assert.throws(()=>custom.setChild(custom.source,'typed',null,{value:{}}),/invalid value/);
    for(const desc of [{kind:'dtype'},dtype(1),dtype(''),dtype('toString'),{...dtype('N'),extra:true}]) assert.throws(()=>build(desc));
});
