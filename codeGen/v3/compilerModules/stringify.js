const misc = require("./misc.js");

function valify(v){
  if(typeof(v.type)!="string"){
    v.type = v.type.value || v.type.name;
  }
  if(v.type == "null"){
    v = 0;
  } else if(v.type == "bool" || v.type == "number"){
    v = v.value*1;
  } else if(v.type == "word"){
    v = v.value;
  } else if(v.type == "string"){
    v = "^"+v.value[0];
  }
  return v;
}

function stringifyF(f){
  let o = "";
  if(!f.stackless){
    //
  } else {
    //function definition
    o += "!defU defF "+f.name.value+"\n\n";
    //contents
    for(let c of f.contents){
      if(c.type == "asm"){
        o += c.value.value;
      } else if(c.type == "set"){
        o += "TRS "+valify(c.value)+","+valify(c.dest);
      } else if(c.type == "dereference"){
        //ofset index
        o += "TRS 0,ALU-C\n";
        o += "TRS "+valify(c.thing)+",ALU-A\n";
        o += "TRS "+valify(c.index)+",ALU-B\n";
        o += "TRS ALU-O,$1\n";
        o += "TRS #0,"+valify(c.to);
      } else if(c.type == "op"){
        //setup op
        let op = {
          "+":0,
          "-":32,
          ">":1,
          "==":2,
          "<":3,
          "&":4,//TEMP
          "~":5,//TEMP
          "|":6,//TEMP
          "!":(a,b,out)=>{
            //bitwise not
            o += "TRS 5,ALU-C\n";//TEMP
            o += `TRS ${valify(a)},ALU-A\n`;
            o += "TRS ALU-O,ALU-A\n";
            //and off top
            o += "TRS 4,ALU-C\n";//TEMP
            o += "TRS 1,ALU-B\n";
            o += `TRS ALU-O,${valify(out)}\n`;
          }
        }[c.opType];
        if(op == undefined)
          misc.error(`[Dev] Op ${c.opType} needs an ALU config!`);
        if(typeof(op)=="number"){
          o += "TRS "+op+",ALU-C\n";
          //a
          o += "TRS "+valify(c.a)+",ALU-A\n";
          //b
          if(c.b)
            o += "TRS "+valify(c.b)+",ALU-B\n";
          //o
          o += "TRS ALU-O,"+valify(c.to);
        } else {
          op(c.a,c.b,c.to);
        }
      } else if(c.type == "branch"){
        if(c.condition){
          o += "!defU cJump "+c.condition.value+" "+c.to;
        } else {
          o += "TRS "+c.to+",PC";
        }
      } else if(c.type == "lable"){
        o += "LBL "+c.value;
      } else if(c.type == "derefNset"){
        //ofset index
        o += "TRS 0,ALU-C\n";
        o += "TRS "+valify(c.thing)+",ALU-A\n";
        o += "TRS "+valify(c.index)+",ALU-B\n";
        o += "TRS ALU-O,$2\n";
        o += "TRS "+valify(c.value)+",#0";
      } else if(c.type == "call"){
        o += `!defU callF ${c.name}`;
      }
      o += "\n\n";
    }
    //definition termination
    o += "!defU retF "+f.name.value;
  }
  return o;
}

function asmVal(v){
  if(v+"" == "null"){
    return "0";
  } else if(typeof(v*1)=="number"){
    return v;
  } else if(typeof(v)=="string"){
    return "&"+v;
  }
}

function stringifyD(ds,structs){
  //output string
  let o = "";
  //loop through definitions
  for(let n of Object.keys(ds)){
    let d = ds[n];
    if(d.valType.name.value == "array"){
      //array
      let a = [];
      if(d.value.type == "number"){
        for(let i=0;i<d.value.value;i++) a.push(0);
      } else if(d.value.type == "string"){
        a = [];
        let chars = d.value.value.split("");
        while(chars.length != 0){
          if(chars[0] == "\\" && chars[1] == "h"){
            let hex = "";
            chars.shift();
            chars.shift();
            while(chars[0] != "h"){
              hex += chars.shift();
              if(chars.length == 0){
                misc.error("String hex insert not ended");
              }
            }
            chars.shift();
            a.push("@"+hex);
          } else if(chars[0] == ","){
            a.push("@2c");
            chars.shift();
          } else {
            a.push("^"+chars.shift());
          }
        }
      } else if(d.value.type == "array"){
        a = d.value.value.map(valify);
      } else if(d.value.type == "null"){
        //empty array
      } else if(d.value.type == "word"){
        //equal to other
        o += "DEF "+n+","+d.value.value+"\n";
        continue;
      } else {
        misc.error("Invalid array value type \""+d.value.type+"\"",d);
      }
      //null-terminate
      a.push(0);
      //pad to even length
      if(a.length % 2 != 0) a.push(0);
      //add header
      o += "LBL "+n+"\n";
      //join
      while(a.length > 0){
        o += "TRS #"+asmVal(a.shift())+
          ",#"+asmVal(a.shift())+"\n";
      }
    } else if(
      ["char","int","null","number","bool","any"]
      .indexOf(d.valType.name.value) != -1
    ){
      //simple type
      o += "DEF "+n+","+asmVal(d.value.value)+"\n";
    } else {
      //struct
      if(d.value.type == "struct"){
        o += "LBL "+n+"\n";
        let complete = true;
        let t = structs.filter(s=>{
          return s.name == d.valType.name.value;
        })[0];
        for(let s of Object.keys(t.slots)){
          let v = d.value.value.filter(p=>{
            return p.name.value == s;
          })[0] || {value:{type:"null",value:null}};
          if(complete){
            o += "TRS #"+valify(v.value)+",#";
            complete = false;
          } else {
            o += valify(v.value)+"\n";
            complete = true;
          }
        }
        if(!complete) o += "#0\n"
      } else if(d.value.type == "null"){
        o += `DEF ${n},0`;
      } else if(d.value.type == "word"){
        //equal to other
        o += "DEF "+n+","+d.value.value+"\n";
        continue;
      } else misc.error("Cannot use type \""+d.value.type+"\" as struct value",d);
    }
    o += "\n"
  }
  //return
  return o;
}

//export
module.exports = {stringifyF,stringifyD};
