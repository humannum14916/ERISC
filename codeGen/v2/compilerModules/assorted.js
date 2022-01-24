const misc = require("./misc.js");

function collectType(sb,n,o=[]){
  for(let c of sb){
    if(c.type == n){
      o.push(c);
    } else if(c.type == "namespace"){
      collectFunctions(sb,o);
    }
  }
  return o;
}

function branchify(contents,lprefix=""){
  let o = [];
  let nextLable = 0;
  for(let c of contents){
    if(c.type == "while"){
      //create base lable
      let bLable = lprefix+"while_"+nextLable+"_";
      nextLable++;
      //create condition lable
      let condLable = bLable+"cond";
      //add initial jump
      o.push({type:"branch",to:condLable});
      //add start lable
      let startLable = bLable+"start";
      o.push({type:"lable",value:startLable});
      //branchify body
      c.body = branchify(c.body,bLable+"body_");
      //add condition lable
      c.body.push({type:"lable",value:condLable});
      //rotate condition
      c.body.push({
        type:"branch",
        condition:c.condition,
        to:startLable
      });
      //add body
      o = o.concat(c.body);
    } else if(c.type == "for"){
      //pop out initilization
      o.push(c.init);
      //create base lable
      let bLable = lprefix+"while_"+nextLable+"_";
      nextLable++;
      //create condition lable
      let condLable = bLable+"cond";
      //add initial jump
      o.push({type:"branch",to:condLable});
      //add start lable
      let startLable = bLable+"start";
      o.push({type:"lable",value:startLable});
      //branchify body
      c.body = branchify(c.body,bLable+"body_");
      //rotate update
      c.body.push(c.update);
      //add condition lable
      c.body.push({type:"lable",value:condLable});
      //rotate condition
      c.body.push({
        type:"branch",
        condition:c.condition,
        to:startLable
      });
      //add body
      o = o.concat(c.body);
    } else if(c.type == "if"){
      //create base lable
      let bLable = lprefix+"if_"+nextLable+"_";
      nextLable++;
      //create end lable
      let endLable = bLable + "end";
      //create chain lables
      let nsl = 0;
      for(let e of c.chain){
        e.startLable = bLable+e.type+"_"+nsl;
        nsl++;
      }
      //add condition chain
      for(let e of c.chain){
        o.push({
          type:"branch",
          condition:e.condition,
          to:e.startLable
        });
      }
      //default condition
      o.push({type:"branch",to:endLable});
      //add exit jumps and start lables
      for(let e of c.chain){
        e.body.unshift({
          type:"lable",value:e.startLable
        });
        e.body.push({type:"branch",to:endLable});
      }
      //branchify bodies
      for(let e of c.chain){
        e.body = branchify(
          e.body,e.startLable+"_"
        );
      }
      //add bodies
      for(let e of c.chain){
        o = o.concat(e.body);
      }
      //add end lable
      o.push({type:"lable",value:endLable});
    } else o.push(c);
  }
  return o;
}

function structResolve(structs){
  //resolved structs
  let o = [];
  //structs to resolve
  let toRes = structs.slice();
  //next set of structs to resolve
  let next = [];
  //has anything been done this loop
  let resolveDone = false;
  //loop
  while(toRes.length > 0){
    for(let s of toRes){
      //check if resolvable
      if((!s.conforms) || (o.filter(r=>{
        return r.name.value
          == s.conforms.value
      }).length != 0)){
        //move line info to base
        s.line = s.name.line;
        s.column = s.name.column;
        s.name = s.name.value;
        //neaten slots
        for(let sl of s.slots){
          sl.name = sl.name.value;
        }
        s.slotsR = s.slots;
        s.slots = {};
        //add length
        s.length = 0;
        //add conform info
        if(s.conforms){
          //get conformee
          let conformee = o.filter(r=>{
            return r.name.value
              == s.conforms.value
          })[0];
          //prepend slot info
          s.slots = Object.assign(
            s.slots,conformee.slots
          );
          //update length info
          s.length = conformee.length;
        }
        //remove conform
        delete s.conforms;
        //resolve slots
        for(let sl of s.slotsR){
          s.slots[sl.name] = {
            type:sl.type,
            index:s.length
          };
          s.length++;
        }
        //remove slotsR
        delete s.slotsR;
        //add to output
        o.push(s);
        //struct has been resolved!
        resolveDone = true;
      } else {
        //que for next iteration
        next.push(s);
      }
    }
    //update toRes
    toRes = next;
    next = [];
    //check for errors
    if(!resolveDone){
      misc.error(
        "Struct "+toRes[0].name.value
        +" could not be resolved",
        toRes[0].name
      );
    }
    resolveDone = false;
  }
  //return
  return o;
}

function extractLDefs(contents){
  let defs = [];
  for(let l of contents){
    if(l.type == "define"){
      defs.push(Object.assign({},l));
      l.type = "set";
      l.exp = [{type:"value",value:l.value}];
      l.dest = [{type:"value",value:l.name}];
      delete l.name;
      delete l.valType;
      delete l.value;
    }
  }
  return defs;
}

module.exports = {
  collectType,branchify,structResolve,extractLDefs
};
