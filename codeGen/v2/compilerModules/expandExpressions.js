const misc = require("./misc.js");

function expand(f,g){
  //misc.log(`Expanding function ${f.name}...`);
  //output list
  let o = [];
  //temp bin
  let temps = {
    total:0,template:"__COMPILER_TEMP_"
    +f.name+"_",freed:0
  };
  //loop through contents
  for(let c of f.contents){
    if(c.type == "set"){
      let {to,writeDest,destType,toFree} = backResolve(
        g,o,temps,c.dest,null,true
      );
      let f = backResolve(g,o,temps,c.exp,to);
      toFree.forEach(t=>{freeTemp(temps,t)});
      o = o.concat(writeDest);
      freeTemp(temps,f);
      let toType = typeStr(destType);
      let fromType = typeStr(compType(g,f));
      if(
        toType != fromType &&
        (toType != "null" && fromType != "null")
      ) misc.error(`Cannot write type ${fromType} to ${toType}`,c);
      if(!to){
        o[o.length - 1].value = f;
      }
    } else if(c.type == "branch" && c.condition){
      c.condition = backResolve(g,o,temps,c.condition);
      o.push(c);
    } else if(c.type == "call"){
      backResolveCallParams(g,o,temps,c);
    } else {
      o.push(c);
    }
  }
  //log statistics
  //misc.log(`Used ${temps.total} temps, ${temps.freed} reuses`);
  //return
  return o;
}

function backResolveCallParams(g,o,temps,call,to,){
  //resolve params
  let prefix = call.name.value.split(".");
  let fName = prefix.pop();
  prefix = prefix.join(".");
  if(prefix.length != 0) prefix += ".";
  for(let i=0;i<call.params.length;i++){
    call.params[i] = backResolve(
      g,o,temps,call.params[i],
      {type:"word",value:
      prefix+"__COMPILER_PARAM_"+
      fName+"_"+g.function.filter(
        p=>{return p.name == call.name.value}
      )[0].params[i].name.value}
    );
  }
  //add call
  o.push({type:"call",name:call.name.value});
  //move return
  if(to){
    o.push({
      type:"set",dest:to,
      value:{type:"word",
        value:prefix+"__COMPILER_RETURN_"+fName
      }
    });
  }
  return {type:"word",
    value:prefix+"__COMPILER_RETURN_"+fName,
    castType:call.castType
  };
}

function backResolve(g,o,temps,exp,to,left=false){
  //operation
  if(exp.type == "access"){
    //back resolve thing
    let thing = backResolve(
      g,o,temps,exp.thing
    );
    //back resolve index
    let index = backResolve(
      g,o,temps,exp.index
    );
    //type of thing
    let thingType = compType(g,thing);
    //check that the type is dereferencable
    if(!thingType.subType)
      misc.error(`Type ${typeStr(thingType)} is not dereferencable`,thing);
    //left-side logic
    if(left){
      return {writeDest:[{
        type:"derefNset",
        thing,index
      }],destType:thingType.subType,
      toFree:[thing,index]};
    }
    //get destination
    if(!to){
      let tempType = thingType.subType;
      if(exp.castType) tempType = exp.castType;
      to = {type:"word",value:getTemp(
        g,temps,tempType
      )};
    }
    //free temps
    freeTemp(temps,thing);
    freeTemp(temps,index);
    //add
    o.push({
      type:"dereference",
      thing,index,to
    });
    return to;
  } else if(exp.type == "call"){
    if(left) misc.error("Cannot use function call as set dest",exp.name.value);
    //resolve call
    exp.name = exp.name.value;
    return backResolveCallParams(g,o,temps,exp,to);
  } else if(exp.type == "value"){
    if(left){
      return {
        to:exp.value,writeDest:[],
        destType:compType(g,exp.value),
        toFree:[]
      };
    }
    if(to){
      o.push({
        type:"set",dest:to,value:exp.value
      });
      return to;
    }
    return Object.assign(
      exp.value,{castType:exp.castType}
    );
  } else if(exp.type == "->"){
    if(
      exp.a.value.type != "word" ||
      exp.b.value.type != "word"
    ){
      console.error(exp);
      misc.error("Indirect struct access is not supported");
    }
    if(
      exp.b.value.value == "length"
    ){
      if(g.struct.findIndex(s=>{
        return s.name == exp.a.value.value;
      }) != -1){
        if(left) misc.error("Cannot use struct length as set destination",exp.a.value);
        //length
        let length = {
          type:"number",value:Object.keys(
            g.struct.find(s=>{
              return s.name == exp.a.value.value;
            }).slots
          ).length
        };
        if(to){
          o.push({
            type:"set",dest:to,value:length
          });
          return to;
        }
        freeTemp(temps,exp.a.value);
        return length;
      } else if(
        varType(g,exp.a.value).name.value
         == "array"
      ){
        if(left) misc.error("Cannot use array length as set destination",exp.a.value);
        //length
        let length = {
          type:"number",value:g.define
            [exp.a.value.value].length
        };
        if(to){
          o.push({
            type:"set",dest:to,value:length
          });
          return to;
        }
        freeTemp(temps,exp.a.value);
        return length;
      }
    }
    //struct access
    let slot = g.struct.filter(s=>{
      return s.name == g.define
      [exp.a.value.value]
      .valType.name.value
    })[0].slots[exp.b.value.value];
    //get index
    let index = {type:"number",value:slot.index};
    //get destination
    if(!to){
      to = {type:"word",value:getTemp(
        g,temps,slot.type
      )};
    }
    //left-side logic
    if(left){
      return {writeDest:[{
        type:"derefNset",
        thing:exp.a.value,index
      }],destType:slot.type,
      toFree:[exp.a.value]};
    }
    //add
    o.push({
      type:"dereference",
      thing:exp.a.value,index,to
    });
    //free temps
    freeTemp(temps,exp.a.value);
    //return
    return to;
  } else {
    if(left){
      misc.error("Cannot use arithmatic result as set destination",exp.a.value);
    }
    //resolve a
    let a = backResolve(
      g,o,temps,exp.a
    );
    //resolve b
    let b;
    if(exp.b){
      b = backResolve(
        g,o,temps,exp.b
      );
    }
    //get types
    let at = typeStr(compType(g,a));
    let bt;
    if(b) bt = typeStr(compType(g,b));
    //type check
    let opReq = {
      "+":{types:[["int"],["int"]],match:true},
      "-":{types:[["int"],["int"]],match:true},
      "==":{types:["any","any"],match:true},
      ">":{types:[
        ["int","char"],["int","char"]
      ],match:true},
      "<":{types:[
        ["int","char"],["int","char"]
      ],match:true},
      "&":{types:[
        ["int","bool","char"],
        ["int","bool","char"]
      ],match:true},
      "|":{types:[
        ["int","bool","char"],
        ["int","bool","char"]
      ],match:true},
      "~":{types:[
        ["bool"],[undefined]
      ],match:false},
      "!":{types:[
        ["bool"],[undefined]
      ],match:false},
    }[exp.type];
    if(!opReq) misc.error("[Dev] Op needs type requirements! "+exp.type);
    if(at != "null" && bt != "null"){
      if(at != bt && opReq.match) misc.error(`Mismatched types to operator ${exp.type}, got ${at} and ${bt}`,a);
      if(opReq.types[0].indexOf(at) == -1 && opReq.types[0] != "any")
        misc.error(`Operator ${exp.type} requires one of types ${opReq.types[0].join(", ")}, got ${at}`,a);
      if(opReq.types[1].indexOf(bt) == -1 && opReq.types[1] != "any")
        misc.error(`Operator ${exp.type} requires one of types ${opReq.types[1].join(", ")}, got ${bt}`,b);
    }
    //get output type
    let outType = {
      "+":{name:{type:"word",value:"int"}},
      "-":{name:{type:"word",value:"int"}},
      "==":{name:{type:"word",value:"bool"}},
      ">":{name:{type:"word",value:"bool"}},
      "<":{name:{type:"word",value:"bool"}},
      "&":"left",
      "|":"left",
      "~":{name:{type:"word",value:"bool"}},
      "!":{name:{type:"word",value:"bool"}},
    }[exp.type];
    if(outType == "left")
      outType = {name:{type:"word",value:at}};
    //get destination
    if(!to){
      to = {type:"word",value:getTemp(
        g,temps,outType
      )};
    }
    //add
    o.push({
      type:"op",
      opType:exp.type,
      a,b,to
    });
    //free temps
    freeTemp(temps,a);
    if(b) freeTemp(temps,b);
    //return
    return to;
  }
}

function typeStr(t){
  let o = t.name.value+"";
  if(t.subType){
    o += "["+typeStr(t.subType)+"]";
  }
  return o;
}

function getTemp(g,temps,typeR){
  //get type string
  let type = typeStr(typeR);
  //ensure temp bin
  if(!temps[type]) temps[type] = [];
  //check for temp
  if(temps[type].length == 0){
    //create new temp
    temps[type].push(
      temps.template+type+"_"+temps.total
    );
    temps.total++;
    //add temp definition
    g.define[temps[type][temps[type].length-1]] = {
      valType:typeR,
      value:{type:"null",value:null}
    };
  }
  //get temp
  let temp = temps[type].shift();
  //return temp
  return temp;
}

function freeTemp(temps,v){
  if(
    v.type == "word" &&
    v.value.indexOf("__COMPILER_TEMP_") == 0){
      let type = v.value.split("_");
      type = type[type.length - 2];
      temps[type].push(v.value);
      temps.freed++;
    }
}

function toType(t){
  if(t == "number"){
    return {name:"int",subType:null};
  } else if(t == "null"){
    return {name:"null",subType:null};
  } else {
    misc.error("Compound type constants in expressions are not supported, had type "+t)
  }
}

function varType(g,varN){
  return g.define[varN.value].valType;
}

function compType(g,c){
  if(c.castType) return c.castType;
  if(c.type == "number") return {name:{type:"word",value:"int"}};
  if(c.type == "null") return {name:{type:"word",value:"null"}};
  if(c.type == "word") return varType(g,c);
  if(c.type == "string"){
    if(c.value.length != 1) misc.error(`Character strings must be length 1, got "${c.value}"`,c);
    return {name:{type:"word",value:"char"}};
  }
}

//export
module.exports = {expand};
