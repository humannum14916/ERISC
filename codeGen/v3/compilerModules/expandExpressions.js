const misc = require("./misc.js");

function expand(f,g){
  //output list
  let o = [];
  //temp bin
  let temps = {
    total:0,template:"__COMPILER_TEMP_"
    +f.name.value+"_",temps:[]
  };
  //loop through contents
  for(let c of f.contents){
    if(c.type == "set"){
      let dest = backResolve(
        g,o,temps,c.dest,null,true
      );
      let source = backResolve(
        g,o,temps,c.exp,dest.varN
      );
      if(!compat(source.type,dest.type)){
        misc.error(`Cannot write type ${
          typeStr(source.type)
        } to ${
          typeStr(dest.type)
        }`,c);
      }
      o = o.concat(dest.write(source.varN));
      freeTemp(temps,source.varN);
      dest.temps.forEach(t=>{
        freeTemp(temps,t);
      });
    } else if(c.type == "branch" && c.condition){
      let cond = backResolve(g,o,temps,c.condition);
      if(!compat(cond.type,{name:{value:"bool"}}))
        misc.error("Expected type bool for branch condition, got "+typeStr(cond.type),c.condition);
      c.condition = cond.varN;
      o.push(c);
      freeTemp(temps,cond.varN);
    } else if(c.type == "call"){
      let call = backResolveCallParams(g,o,temps,c);
      freeTemp(temps,call.varN);
    } else {
      o.push(c);
    }
  }
  //return
  return o;
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
    //check that the type is dereferencable
    if(!thing.type.subType)
      misc.error(`Type ${typeStr(thingType)} is not dereferencable`,thing);
    //left-side logic
    if(left){
      return {
        type:thing.type.subType,
        temps:[thing.varN,index.varN],
        write:v=>{return [{
          type:"derefNset",
          thing:thing.varN,
          index:index.varN,
          value:v
        }]}
      };
    }
    //get destination
    if(!to){
      to = {type:"word",value:getTemp(
        g,temps
      )};
    }
    //free temps
    freeTemp(temps,thing);
    freeTemp(temps,index);
    //add
    o.push({
      type:"dereference",
      thing:thing.varN,
      index:index.varN,to
    });
    return {varN:to,type:thing.type.subType};
  } else if(exp.type == "call"){
    if(left) misc.error("Cannot use function call as set dest",exp.name.value);
    //resolve call
    exp.name = exp.name.value;
    return backResolveCallParams(g,o,temps,exp,to);
  } else if(exp.type == "value"){
    if(left){
      if(exp.value.type != "word")
        misc.error(`Cannot use ${compType(g,exp.value)} as set destination`,exp.value);
      return {
        varN:exp.value,
        type:varType(g,exp.value),
        write:()=>{return []},
        temps:[]
      };
    }

    //get destination
    if(to){
      o.push({
        type:"set",dest:to,value:exp.value
      });
    }
    
    return {
      varN:exp.value,
      type:compType(g,exp.value)
    };
  } else if(exp.type == "cast"){
    //resolve target
    let target = backResolve(g,o,temps,exp.target,to,left);
    target.type = exp.toType;
    return target;
  } else if(exp.type == "->"){
    if(
      exp.b.type != "value" ||
      exp.b.value.type != "word"
    ){
      misc.error("Struct property name must be a word",exp.b.value);
    }
    
    //back resolve struct
    let struct = backResolve(g,o,temps,exp.a);

    //get struct type
    let sType = g.struct.filter(s=>{
      return s.name == struct.type.name.value;
    })[0];

    if(!sType)
      misc.error(`Type ${
        typeStr(struct.type)
      } is not a struct`,exp);

    //get slot
    let slot = sType.slots[exp.b.value.value];

    if(!slot)
      misc.error(`Struct type ${
        typeStr(sType)
      } does not have property ${
        exp.b.value.value
      }`,exp.b.value);

    //get index
    let index = {
      type:"word",
      value:sType.name+"."
        +exp.b.value.value
    };
    //left-side logic
    if(left){
      return {
        type:slot.type,
        temps:[struct.varN,index],
        write:v=>{return [{
          type:"derefNset",
          thing:struct.varN,index,
          value:v
        }]}
      };
    }
    //get destination
    if(!to){
      to = {type:"word",value:getTemp(
        g,temps
      )};
    }
    //free temps
    freeTemp(temps,struct.varN);
    //add
    o.push({
      type:"dereference",
      thing:struct.varN,index,to
    });
    return {varN:to,type:slot.type};
  } else {
    if(left){
      misc.error("Cannot use operation result as set destination",exp);
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
    let at = typeStr(a.type);
    let bt;
    if(b) bt = typeStr(b.type);
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
        g,temps
      )};
    }
    //add
    o.push({
      type:"op",
      opType:exp.type,
      a:a.varN,b:(b||{}).varN,to
    });
    //free temps
    freeTemp(temps,a.varN);
    if(b) freeTemp(temps,b.varN);
    //return
    return {varN:to,type:outType};
  }
}

function backResolveCallParams(g,o,temps,call,to){
  let toFree = [];
  let f = g.function.filter(
    p=>{return p.name.value == call.name.value}
  )[0];
  
  //resolve params
  for(let i=0;i<call.params.length;i++){
    let param = backResolve(
      g,o,temps,call.params[i],{
        type:"word",
        value:call.name.value + "."
          + f.params[i].name.value
      }
    );
    if(!compat(param.type,f.params[i].type))
      misc.error(`Expected type ${
        typeStr(f.params[i].type)
      } for function param, got ${
        typeStr(param.type)
      }`,call.params[i]);
    toFree.push(param.varN);
  }

  //add call
  o.push({type:"call",name:call.name.value});

  //free temps
  toFree.forEach(tf=>{
    freeTemp(temps,tf);
  });

  //move return
  if(to){
    o.push({
      type:"set",dest:to,
      value:{type:"word",
        value:call.name.value+".return"
      }
    });
  }
  return {varN:{type:"word",
    value:call.name.value+".return",
  },type:f.retType};
}

function typeStr(t){
  let o = t.name.value+"";
  if(t.subType){
    o += "["+typeStr(t.subType)+"]";
  }
  return o;
}

function getTemp(g,temps){
  //check for temp
  if(temps.temps.length == 0){
    //create new temp
    temps.temps.push(
      temps.template+temps.total
    );
    temps.total++;
    //add temp definition
    g.define[temps.temps[temps.temps.length-1]] = {
      valType:{name:"any"},
      value:{type:"null",value:null}
    };
  }
  //return temp
  return temps.temps.shift();
}

function freeTemp(temps,v){
  if(
    v.type == "word" &&
    v.value.indexOf("__COMPILER_TEMP_") == 0)
  {
    temps.temps.push(v.value);
    temps.freed++;
  }
}

function varType(g,varN){
  return g.define[varN.value].valType;
}

function compType(g,c){
  if(c.castType) return c.castType;
  if(c.type == "number") return {name:{value:"int"}};
  if(c.type == "null") return {name:{value:"null"}};
  if(c.type == "word") return varType(g,c);
  if(c.type == "bool") return {name:{value:"bool"}};
  if(c.type == "string"){
    if(c.value.length != 1) misc.error(`Character strings must be length 1, got "${c.value}"`,c);
    return {name:{type:"word",value:"char"}};
  }
}

function compat(a,b){
  return typeStr(a) == typeStr(b) ||
    a.name.value == "null" ||
    b.name.value == "null";
}

//export
module.exports = {expand};
