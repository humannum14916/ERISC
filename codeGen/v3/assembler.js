const read = require("fs").readFileSync;
const {decHex,hexDec,toASCII} = require("../../utils/convert.js");
const {serve} = require("../../utils/ioWrap.js");

function error(m,v){
  console.error("Assembly error:");
  console.error(m);
  if(v) console.error(v);
  process.exit(1);
}

function preP(code,root){
  return prePDec(prePDef(prePLink(code,root)));
}

function prePLink(codeE,root){
  let code = codeE.slice();
  let out = "";
  while(code.length>0){
    if(code[0] == ";"){
      let end = code.indexOf("\n");
      code = code.slice(end-1);
    } else if(code.slice(0,6) == "!link "){
        let end = code.indexOf("\n");
        let path = code.slice(6,end);
        code = code.slice(end);
        let other = read(root+path,"utf8");
        code = "_" + other + code;
    } else {
      out += code[0];
    }
    code = code.slice(1);
  }
  return out;
}

function prePDef(codeE){
  //get definitions
  let code = codeE.slice();
  let outA = "";
  let defs = {};
  while(code.length>0){
    if(code.slice(0,5) == "!def "){
      let endL = code.indexOf("\n");
      let name = code.slice(5,endL);
      let end = code.indexOf("!defE "+name+"\n");
      let def = code.slice(endL,end-1);
      code = code.slice(end+name.length+7);
      defs[name] = def;
    } else {
      outA += code[0];
    }
    code = code.slice(1);
  }
  //replace
  code = outA.slice();
  let out = "";
  while(code.length>0){
    if(code.slice(0,6) == "!defU "){
      let end = code.indexOf("\n");
      let params = code.slice(6,end).split(" ");
      code = useMacro(defs,params) + code.slice(end);
    } else {
      out += code[0];
    }
    code = code.slice(1);
  }
  return out;
}

function useMacro(ms,params){
  let m = ms[params[0]];
  let name = params[0];
  if(!m) error("Macro \""+name+"\" undefined");
  params = params.slice(1);
  let o = "";
  while(m.length>0){
    if(m[0] == "%"){
      let end = 100;
      for(let e of [" ","\n",","]){
        let l = m.indexOf(e);
        if(l != -1 && l < end) end = l;
      }
      let n = m.slice(1,end);
      m = m.slice(end);
      let p = params[n*1];
      if(!p) error("Macro parameter "+n+" not defined in macro "+name);
      o += p;
    } else {
      o += m[0];
      m = m.slice(1);
    }
  }
  return o;
}

function prePDec(codeE){
  let code = codeE.slice();
  let out = "";
  while(code.length>0){
    if(code.slice(0,2) == "//"){
      let end = code.indexOf("\n");
      code = code.slice(end+1);
      code = "_" + code;
    } else {
      out += code[0];
    }
    code = code.slice(1);
  }
  return out;
}

function parse(code){
  let lines = code.split("\n").filter(l=>{return l!=""});
  let parsed = [];
  for(let line of lines){
    let op = line.slice(0,3);
    let params = line.slice(4).trim().split(",").map(p=>{
      let o = {direct:false,relative:false};
      if(p[0] == "#"){
        p = p.slice(1);
        o.direct = true;
      } else if(p[0] == "$"){
        p = p.slice(1);
        o.relative = true;
        o.direct = true;
      }
      if(p[0] == "@"){
        p = p.slice(1);
        o.val = hexDec(p);
      } else if(p[0] == "^"){
        p = p.slice(1);
        o.val = toASCII(p+" ")[0];
      } else {
        o.val = p;
      }
      if(o.val == undefined){
        console.error("Malformed parameter: \""+line+"\"");
        process.exit(1);
      }
      return o;
    });
    parsed.push({op:op,params:params});
  }
  return parsed;
}

function compileP(parsed){
  let alls = [];
  let num = 0;
  for(let com of parsed){
    if(!(
      ((com.op == "LBL") && (com.params.length == 1)) ||
      ((com.op == "TRS") && (com.params.length == 2)) ||
      ((com.op == "DEF") && (com.params.length == 2))
    )){
      error("Malformed instruction at "+num+": ",com);
    }
    for(let par of com.params){
      if(!par.direct){
        alls.push(par.val);
      }
    }
    num++
  }
  alls = alls.reduce((cur,el)=>{
    if(cur.indexOf(el)==-1) cur.push(el);
    return cur;
  },[]);
  let adrs = {};
  for(let a of alls) adrs[a] = 0;
  let ops = [];
  for(let l of parsed){
    if(l.op == "TRS"){
      for(let p of l.params){
        ops.push(p);
      }
    } else if(l.op == "LBL"){
      adrs[l.params[0].val] = ops.length;
    } else if(l.op == "DEF"){
      if(Number.isNaN(l.params[1].val*1)){
        adrs[l.params[0].val] = adrs[l.params[1].val];
      } else {
        adrs[l.params[0].val] = l.params[1].val;
      }
    }
  }
  let next = ops.length;
  for(let a of Object.keys(adrs)){
    let pres = {
      "PC":{adr:hexDec("ffff")},//Program counter
      "PC2":{adr:hexDec("fffe")},//Program counter secondary
      "ALU-O":{adr:hexDec("fffd")},//ALU output
      "ALU-B":{adr:hexDec("fffc")},//ALU B input
      "ALU-A":{adr:hexDec("fffb")},//ALU A input
      "ALU-C":{adr:hexDec("fffa")},//ALU config
      "LCD":{adr:hexDec("fff9")},//Hex display
      "TTY":{adr:hexDec("fff8")},//TTY
      "KBD":{adr:hexDec("fff7")},//Keyboard
      "HD-SR":{adr:hexDec("fff6")},//Hard drive source
      "HD-DS":{adr:hexDec("fff5")},//Hard drive dest
      "HD-TR":{adr:hexDec("fff4")},//Hard drive init transfer
      "BF-PL":{adr:hexDec("fff3")},//Bus firewall page length
      "BF-PS":{adr:hexDec("fff2")},//Bus firewall page source
    }[a];
    if(pres){
      adrs[a] = pres;
    } else {
      adrs[a] = {adr:next,val:adrs[a]};
      next++
      if(/^\d+$/.test(a)){
        adrs[a].val = a*1;
      }
    }
  }
  let o = [];
  for(let op of ops) {
     if(op.relative) {
      let ofs = op.val*1;
      let pos = o.length;
      o.push(pos + ofs);
    }else if(op.direct){
      if(Number.isNaN(op.val*1)){
        o.push(adrs[op.val].val);
      } else o.push(op.val);
    } else {
      o.push(adrs[op.val].adr);
    }
  }
  for(let a of Object.keys(adrs)){
    if(adrs[a].val!=undefined) o.push(adrs[a].val);
  }
  let ot = [];
  for(let i=0;i<o.length;i++){
    let adr = decHex(i);
    ot.push([adr,decHex(o[i])]);
  }
  return ot;
}

function print(bin){
  for(l of bin) console.log(l);
}

function compile(code,root){
  return compileP(parse(preP(code,root)));
}

function format(bin){
  let filled = {};
  for(let a of bin){
    filled[a[0]] = a[1];
  }
  let read = 0;
  let out = "v2.0 raw\n";
  let adr = 0;
  let addLine = 0;
  while(read < bin.length){
    if(addLine == 8){
      addLine = 0;
      out += "\n";
    }
    let pre = (out[out.length-1]=="\n")?"":" ";
    let hex = decHex(adr);
    if(filled[hex]){
      out += pre+filled[hex];
      read++
    } else {
      out += pre+"0"
    }
    adr++
    addLine++
  }
  out += "\n";
  return out;
}

serve((d,params)=>{
  if(!params[0]) error("No build root!");
  let o = compile(d,params[0]);
  if(!params[1]) o = format(o);
  if(params[1]) o = JSON.stringify(o);
  return o;
});
