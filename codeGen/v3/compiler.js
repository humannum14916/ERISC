
const misc = require("./compilerModules/misc.js");
const parsing = require("./compilerModules/parsing.js");
const nameResolution = require("./compilerModules/nameResolution.js");
const decomposeExpressions = require("./compilerModules/decomposeExpressions.js");
const expandExprs = require("./compilerModules/expandExpressions");
const stringify = require("./compilerModules/stringify.js");
const {
  collectType,branchify,structResolve,
  extractLDefs,neatenDefine
} = require("./compilerModules/assorted.js");

function compile(program,root,file){
  misc.error.file = program;
  misc.error.path = file;
  misc.error.root = root;
  //lex
  program = parsing.lex(program,root);
  //parse
  program = parsing.parseStructureBlock(program);
  //branchify functions
  collectType(program,"function").map(f=>{
    f.contents = branchify(f.contents);
  });
  //determine struct layout
  structs = structResolve(
    collectType(program,"struct")
  );
  //name resolution for definitions
  //and definition collection
  let names = structs.map(s=>{
    return [{
      value:s.name + ".length",
      line:s.line,column:s.column
    }].concat(Object.keys(s.slots).map(
      sn => {
        return {
          value:s.name+"."+sn,
          line:s.slots[sn].type.name.line,
          column:s.slots[sn].type.name.column
        };
      }
    ));
  }).flat();
  nameResolution.defCollect(names,{
    contents:program
  });
  //finish name resolution
  nameResolution.nameResolve(
    {contents:program},names,{name:{value:""}}
  );
  //remove namespaces and scopes
  program = nameResolution.finishResolution(
    {contents:program}
  );
  //collect other components
  let functions = collectType(program,"function");
  let metadata = collectType(program,"metadata");
  let defines = collectType(program,"define");
  //add struct type definitions
  defines = defines.concat(structs.map(st=>{
    return [{
      valType:{name:{value:"int"}},
      name:{value:st.name+".length"},
      value:{type:"number",value:st.length}
    }].concat(Object.keys(st.slots).map(sn=>{
      return [{
        valType:{name:{value:"int"}},
        name:{value:st.name+"."+sn},
        value:{
          type:"number",
          value:st.slots[sn].index
        }
      }];
    }).flat());
  }).flat());
  //neaten definitions
  defines = neatenDefine(defines);
  //handle local definitions
  let functionsToAdd = [];
  for(let f of functions){
    //extract local definitions
    let lDefs = extractLDefs(f.contents);
    //handle
    if(f.stackless){
      //add to global definitions
      defines = Object.assign(defines,
        neatenDefine(lDefs)
      );
    } else if(!f.stackless) {
      //create frame struct
      let frame = f.name.value+".__stackFrameT";
      let frameStruct = {
        name:frame,
        line:f.name.line,
        column:f.name.column,
        slots:{}
      };
      let frameSlots = lDefs.slice();
      //add params / return variable
      for(let n of Object.keys(defines)){
        if(n.indexOf(f.name.value) == 0){
          let v = {...defines[n]};
          v.name = {
            line:v.line,
            column:v.column,
            value:n
          };
          frameSlots.push(v);
        }
      }
      //add temp return address and prev frame
      frameSlots.push({
        name:{value:f.name.value+".__returnAdr"},
        value:{type:"null",value:"null"},
        valType:{name:{value:"int"}}
      });
      frameSlots.push({
        name:{value:f.name.value+".__prevFrame"},
        value:{type:"null",value:"null"},
        valType:{name:{value:frameStruct.name}}
      });
      //define slots
      frameSlots.forEach((d,i)=>{
        frameStruct.slots[d.name.value] =
          {type:d.valType,index:i}
      });
      //add to structs
      structs.push(frameStruct);
      //add struct type definitions
      sDefines = neatenDefine([{
        valType:{name:{value:"int"}},
        name:{value:frameStruct.name+".length"},
        value:{type:"number",value:Object.keys(frameStruct.slots).length}
      },{
        valType:{name:{value:"int"}},
        name:{value:f.name.value+".__RetAdr"},
        value:{type:"null",value:"null"}
      },{
        valType:{name:{value:frameStruct.name}},
        name:{value:f.name.value+".__tPrevFrame"},
        value:{type:"null",value:"null"}
      },{
        valType:{name:{value:frameStruct.name}},
        name:{value:f.name.value+".__frame"},
        value:{type:"null",value:"null"}
      }].concat(Object.keys(frameStruct.slots).map((sn,i)=>{
        return [{
          valType:{name:{value:"int"}},
          name:{value:frameStruct.name+"."+sn},
          value:{
            type:"number",
            value:i
          }
        }];
      }).flat()).concat(lDefs));
      Object.assign(defines,sDefines);
      //create pushFrame and popFrame functions
      let pushFrame = {
        stackless:true,
        retType:{name:{value:"void"}},
        name:{
          value:f.name.value+".__pushFrame",
          line:f.name.line,
          column:f.name.column
        },
        contents:Object.keys(
          frameStruct.slots
        ).map(sn=>{
          if(sn == f.name.value+".__returnAdr")
            return {type:"asm",value:{value:""}};
          if(sn == f.name.value+".__prevFrame")
            return {type:"asm",value:{value:""}};
          return {
            type:"set",
            exp:[{
              type:"value",
              value:{
                type:"word",
                value:sn
              }
            }],
            dest:[{
              type:"value",
              value:{
                type:"word",
                value:f.name.value+".__frame"
              }
            },{
              type:"operator",
              value:{value:"->"}
            },{
              type:"value",
              value:{
                type:"word",
                value:sn
              }
            }]
          };
        })
      };
      let popFrame = {
        stackless:true,
        retType:{name:{value:"void"}},
        name:{
          value:f.name.value+".__popFrame",
          line:f.name.line,
          column:f.name.column
        },
        contents:Object.keys(
          frameStruct.slots
        ).map(sn=>{
          if(sn == f.name.value+".__returnAdr")
            return {type:"asm",value:{value:""}};
          if(sn == f.name.value+".__prevFrame")
            return {type:"asm",value:{value:""}};
          return {
            type:"set",
            exp:[{
              type:"value",
              value:{
                type:"word",
                value:f.name.value+".__frame"
              }
            },{
              type:"operator",
              value:{value:"->"}
            },{
              type:"value",
              value:{
                type:"word",
                value:sn
              }
            }],
            dest:[{
              type:"value",
              value:{
                type:"word",
                value:sn
              }
            }]
          };
        })
      };
      //add to functions
      functionsToAdd.push(pushFrame);
      functionsToAdd.push(popFrame);

      //5 - save ___RetAdr to __frame->returnAdr
      f.contents.unshift({
        type:"set",
        exp:[{
          type:"value",
          value:{
            type:"word",
            value:f.name.value+".__RetAdr"
          }
        }],
        dest:[{
          type:"value",
          value:{
            type:"word",
            value:f.name.value+".__frame"
          }
        },{
          type:"operator",
          value:{value:"->"}
        },{
          type:"value",
          value:{
            type:"word",
            value:f.name.value+".__returnAdr"
          }
        }]
      });
      //4 - save ___tPrevFrame to __frame->prevFrame
      f.contents.unshift({
        type:"set",
        exp:[{
          type:"value",
          value:{
            type:"word",
            value:f.name.value+".__tPrevFrame"
          }
        }],
        dest:[{
          type:"value",
          value:{
            type:"word",
            value:f.name.value+".__frame"
          }
        },{
          type:"operator",
          value:{value:"->"}
        },{
          type:"value",
          value:{
            type:"word",
            value:f.name.value+".__prevFrame"
          }
        }]
      });
      //3 - create new stack frame in __frame
      f.contents.unshift({
        type:"set",
        dest:[{
          type:"value",
          value:{
            type:"word",
            value:f.name.value+".__frame"
          }
        }],
        exp:[
          {
            type:"cast",
            toType:{name:{value:frameStruct.name}}
          },{
            type:"value",
            value:{value:"__CreateStackFrame"}
          },{
            type:"call",
            params:[[{
              type:"value",
              value:{
                type:"word",
                value:frameStruct.name+".length"
              }
            }]]
          }
        ]
      });
      //2 - save __frame to __tPrevFrame
      f.contents.unshift({
        type:"set",
        dest:[{
          type:"value",
          value:{
            type:"word",
            value:f.name.value+".__tPrevFrame"
          }
        }],
        exp:[{
          type:"value",
          value:{
            type:"word",
            value:f.name.value+".__frame"
          }
        }]
      });
      //1 - save return address to __RetAdr
      f.contents.unshift({
        type:"asm",value:{value:
          `TRS $-1,${f.name.value}.__RetAdr`
        }
      });

      //1 - save __frame->returnAdr to __RetAdr
      f.contents.push({
        type:"set",
        exp:[{
          type:"value",
          value:{
            type:"word",
            value:f.name.value+".__frame"
          }
        },{
          type:"operator",
          value:{value:"->"}
        },{
          type:"value",
          value:{
            type:"word",
            value:f.name.value+".__returnAdr"
          }
        }],
        dest:[{
          type:"value",
          value:{
            type:"word",
            value:f.name.value+".__RetAdr"
          }
        }]
      });
      //2 - save __frame->prevFrame to __tPrevFrame
      f.contents.push({
        type:"set",
        exp:[{
          type:"value",
          value:{
            type:"word",
            value:f.name.value+".__frame"
          }
        },{
          type:"operator",
          value:{value:"->"}
        },{
          type:"value",
          value:{
            type:"word",
            value:f.name.value+".__prevFrame"
          }
        }],
        dest:[{
          type:"value",
          value:{
            type:"word",
            value:f.name.value+".__tPrevFrame"
          }
        }]
      });
      //3 - free the stack frame __frame
      f.contents.push({
        type:"call",
        name:{value:"__FreeStackFrame"},
        params:[[{
          type:"cast",
          toType:{name:{value:"int"}}
        },{
          type:"value",
          value:{
            type:"word",
            value:f.name.value+".__frame"
          }
        }]]
      });
      //4 - save __tPrevFrame to __frame
      f.contents.push({
        type:"set",
        dest:[{
          type:"value",
          value:{
            type:"word",
            value:f.name.value+".__frame"
          }
        }],
        exp:[{
          type:"value",
          value:{
            type:"word",
            value:f.name.value+".__tPrevFrame"
          }
        }]
      });
      //5 - return from function
      f.contents.push({
        type:"asm",value:{value:
          `TRS ${f.name.value}.__RetAdr,PC`
        }
      });
    }
  }
  functions = functions.concat(functionsToAdd);
  //decompose expressions
  decomposeExpressions.decomposeExpressions(functions);
  //expand expressions
  for(let f of functions){
    f.contents = expandExprs.expand(f,{define:defines,struct:structs,function:functions});
  }
  //stringify functions
  functions = 
    ";-----------;\n"+
    "; Functions ;\n"+
    ";-----------;\n\n"+
    functions.map(f=>{
      return stringify.stringifyF(f);
    }).join("\n\n\n")+"\n\n";
  //stringify definitions
  defines = 
    ";-------------;\n"+
    "; Definitions ;\n"+
    ";-------------;\n\n"+
    stringify.stringifyD(defines,structs);
  //build output
  let output = readFileSync(root+"headers/default");
  //specified headers
  metadata.forEach(m=>{
    if(m.key.value == "header"){
      output = output+readFileSync(root+"headers/"+m.value.value);
    }
  });
  //code
  output += functions + defines;
  //return
  return output;
}

const {readFileSync} = require("fs");
const {serve} = require("../../utils/ioWrap.js");

serve((d,params)=>{
  if(!params[0]) misc.error("No build root!");
  let o = compile(d,params[0],params[1]);
  return o;
});
