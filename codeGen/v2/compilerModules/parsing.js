const misc = require("./misc.js");
const convert = require("../../../utils/convert.js");
const {readFileSync} = require("fs");

//lexing
function lex(code,root){
  //preprocessing
  code = (code=>{
    let o = "";
    let inString = false;
    let escaped = false;
    let linked = [];
    while(code.length != 0){
      if(!inString){
        if(code[0] == "\""){
          inString = true;
        } else if(code.indexOf("#link ") == 0){
          code = code.slice(6);
          let end = code.indexOf("\n");
          let path = code.slice(0,end);
          code = code.slice(end);
          if(linked.indexOf(path) == -1){
            o += readFileSync(root + path);
            linked.push(path);
          }
        }
      } else {
        if(code[0] == "\\"){
          escaped = true;
        } else if(!escaped && code[0] == "\""){
          inString = false;
        }
      }
      o += code[0];
      code = code.slice(1);
    }
    return o;
  })(code);
  misc.error.file = code;
  //split into characters
  code = code.split("").map(c=>{
    return {type:"character",value:c}
  });
  //add line and character information
  code = (code=>{
    let lineNum = 1;
    let charNum = 1;
    code.forEach(c=>{
      c.line = lineNum;
      c.column = charNum;
      charNum++;
      if(c.value == "\n"){
        lineNum++;
        charNum = 1;
      }
    });
    return code
  })(code);
  //collect strings
  code = (code=>{
    let codeO = [];
    let curString = "";
    let inString = false;
    let escaped = false;
    let startLine = 0;
    let startCol = 0;
    for(c of code){
      if(!inString){
        if(c.value != "\""){
          codeO.push(c);
        } else {
          inString = true;
          startLine = c.line;
          startCol = c.column;
        }
      } else {
        if(c.value == "\\"){
          escaped = true;
        } else if(c.value == "\"" && !escaped){
          inString = false;
          codeO.push({
            type:"string",value:curString,
            line:startLine,column:startCol
          });
          curString = "";
          escaped = false;
        } else {
          if(escaped){
            if(c.value == "n"){
              curString += "\\hah";
            } else if(c.value == "\""){
              curString += "\"";
            } else {
              curString += "\\";
              curString += c.value;
            }
          } else {
            curString += c.value;
          }
          escaped = false;
        }
      }
    }
    return codeO;
  })(code);
  //remove comments
  code = (code=>{
    let codeO = [];
    let firstSlash = false;
    let inComment = false;
    for(c of code){
      if(inComment == "line"){
        if(
          c.type == "character"
          && c.value == "\n"
        ){
          codeO.push(c);
          inComment = false;
        }
      } else if(inComment == "block"){
        if(firstSlash){
          if(
            c.type == "character"
            && c.value == "/"
          ) {
            inComment = false;
          }
          firstSlash = false;
        } else {
          if(
            c.type == "character"
            && c.value == "*"
          ) {
            firstSlash = true;
          }
        }
      } else {
        if(
          c.type == "character"
          && c.value == "/"
        ) {
          if(firstSlash){
            codeO.pop();
            firstSlash = false;
            inComment = "line";
          } else {
            codeO.push(c);
            firstSlash = true;
          }
        } else if(
          c.type == "character"
          && c.value == "*"
          && firstSlash
        ){
          codeO.pop();
          inComment = "block";
        } else {
          codeO.push(c);
        }
      }
    }
    return codeO;
  })(code);
  //collapse whitespace
  code = (code=>{
    let codeO = [];
    let startLine = 0;
    let startCol = 0;
    let inWhitespace = false;
    for(let c of code){
      if(
        c.type == "character"
        && /\s/.test(c.value)
      ){
        if(startLine == 0){
          startLine = c.line;
          startCol = c.column;
        }
        inWhitespace = true;
      } else {
        if(inWhitespace){
          inWhitespace = false;
          codeO.push({
            type:"whitespace",
            line:startLine,
            column:startCol
          });
        }
        codeO.push(c);
      }
    }
    return codeO;
  })(code);
  //trim
  if((code[0]||{}).type == "whitespace") code.shift();
  if((code[code.length-1]||{}).type == "whitespace")
    code.shift();
  //recognise (, {, and [
  code.forEach(c=>{
    if(
      c.type == "character"
      && "({[".indexOf(c.value) != -1
    ) {
      c.type = "encloseStart";
    }
  });
  //recognise ), }, and ]
  code.forEach(c=>{
    if(
      c.type == "character"
      && ")}]".indexOf(c.value) != -1
    ) {
      c.type = "encloseEnd";
    }
  });
  //recognise tokens
  code.forEach(c=>{
    if(
      c.type == "character"
      && ";,:=&|!+-*/><~".indexOf(c.value) != -1
    ) {
      c.type = "token";
    }
  });
  //recognise words
  code = (code=>{
    let codeO = [];
    let curWord = "";
    let startLine = 0;
    let startCol = 0;
    for(let c of code){
      if(c.type == "character"){
        curWord += c.value;
        if(startLine == 0){
          startLine = c.line;
          startCol = c.column;
        }
      } else {
        if(curWord != ""){
          codeO.push({
            type:"word",value:curWord,
            line:startLine,column:startCol
          });
          curWord = "";
          startLine = 0;
        }
        codeO.push(c);
      }
    }
    return codeO;
  })(code);
  //recognize ->, == and !=
  code = (code=>{
    let o = [];
    for(let c of code){
      if(
        c.type == "token" && c.value == ">" &&
        o[o.length - 1].type == "token" &&
        o[o.length - 1].value == "-"
      ){
        let p = o.pop();
        o.push({
          type:"token",value:"->",
          line:p.line,
          column:p.column
        });
      } else if(
        c.type == "token" && c.value == "=" &&
        o[o.length - 1].type == "token" &&
        o[o.length - 1].value == "="
      ){
        let p = o.pop();
        o.push({
          type:"token",
          value:"==",
          line:p.line,
          column:p.column
        });
      } else if(
        c.type == "token" && c.value == "=" &&
        o[o.length - 1].type == "token" &&
        o[o.length - 1].value == "!"
      ){
        let p = o.pop();
        o.push({
          type:"token",
          value:"!=",
          line:p.line,
          column:p.column
        });
      } else {
        o.push(c);
      }
    }
    return o;
  })(code);
  //remove whitespace markers
  code = code.filter(c=>{
    return c.type != "whitespace";
  });
  //handle enclosures
  code = enclose(code).contents;
  //return
  return code;
}

function enclose(code,end){
  let codeO = [];
  while(
    code.length != 0 &&
    code[0].type != "encloseEnd" &&
    code[0].value != end
  ) {
    if(code[0].type == "encloseStart"){
      //remove start
      let start = code.shift();
      //get contents
      let contents = enclose(code,
        ")}]"["({[".indexOf(start.value)]
      );
      code = contents.code;
      contents = contents.contents;
      //remove end
      code.shift();
      //add
      codeO.push({
        type:"enclose",
        contents,
        bound:start.value,
        line:start.line,
        column:start.column
      });
    } else {
      codeO.push(code.shift());
    }
  }
  if(code.length == 0 && end) misc.error("Unclosed "+end);
  if(code.length != 0 && !end) misc.error("Extra enlcose ending");
  return {code,contents:codeO};
}

//parsing
function parseStructureBlock(code){
  let o = [];
  while(code.length > 0){
    //get line
    let line = [];
    try {
      while(
        code[0].type != "token"
        || code[0].value != ";"
      ) line.push(code.shift());
    } catch(e){
      if(code.length == 0){
        misc.error("Unexpected end, you probably forgot a semicolon somewhere");
      } else throw e;
    }
    code.shift();
    //get line type
    let lineTypeF = line.shift();
    let lineType = lineTypeF.value;
    misc.typeCheck(lineTypeF,"word");
    //parse line
    if(lineType == "meta"){
      //get key
      let key = line.shift();
      misc.typeCheck(key,"word");
      //get value
      let value = line.shift();
      misc.typeCheck(value,"word");
      //return
      o.push({
        type:"metadata",key,value
      });
    } else if(lineType == "struct"){
      //get name
      let name = line.shift();
      misc.typeCheck(name,"word");
      //get contents / conforms
      let contents = line.shift();
      let conforms;
      if(
        contents.type == "word"
        && contents.value == "conforms"
      ) {
        //that's not contents, that's conforms!
        conforms = line.shift();
        misc.typeCheck(conforms,"word");
        contents = line.shift();
      }
      misc.typeCheck(contents,"enclose");
      contents = contents.contents;
      //parse contents
      let slots = [];
      while(contents.length != 0){
        //get type
        let type = parseType(contents);
        contents = type.rest;
        type = type.value;
        //get name
        let name = contents.shift();
        misc.typeCheck(name,"word");
        //remove end-of-line token
        if(contents.length != 0){
          misc.typeCheck(contents.shift(),"token",",");
        }
        //add to slot list
        slots.push({type,name});
      }
      //return
      o.push({
        type:"struct",name,conforms,slots
      });
    } else if(lineType == "define"){
      //get type
      let type = parseType(line);
      line = type.rest;
      type = type.value;
      //get name
      let name = line.shift();
      misc.typeCheck(name,"word");
      //remove =
      if(line.length == 1) misc.error("Unexpected end of line",line.shift());
      misc.typeCheck(line.shift(),"token","=");
      //get starting value
      let value = parseValue(line.shift());
      //return
      o.push({
        type:"define",valType:type,name,value
      });
    } else if(lineType == "function"){
      //check for stackless
      let stackless = false;
      if(
        line[0].type == "word"
        && line[0].value == "stackless"
      ) {
        stackless = true;
        line.shift();
      }
      //get type
      let retType = parseType(line);
      line = retType.rest;
      retType = retType.value;
      //get name
      let name = line.shift();
      misc.typeCheck(name,"word");
      //get parameters
      let paramsR = line.shift();
      misc.typeCheck(paramsR,"enclose");
      paramsR = paramsR.contents;
      //parse params
      let params = [];
      while(paramsR.length != 0){
        //get type
        let type = parseType(paramsR);
        paramsR = type.rest;
        type = type.value;
        //get name
        let name = paramsR.shift();
        misc.typeCheck(name,"word");
        //remove end-of-line
        if(paramsR.length != 0){
          misc.typeCheck(paramsR.shift(),"token",",");
        }
        //return
        params.push({
          type,name
        });
      }
      //get contents
      let contents = line.shift();
      misc.typeCheck(contents,"enclose");
      contents = parseCodeBlock(contents.contents);
      //parameter and return variable definition
      if(stackless){
        //return variable
        if(retType.name.value != "void"){
          o.push({
            type:"define",
            valType:retType,
            name:{
              type:"word",line:-1,column:-1,
              value:"__COMPILER_RETURN_"
                +name.value
            },
            value:{
              type:"null",value:"null",
              line:-1,column:-1
            }
          });
        }
        //parameters
        for(let p of params){
          o.push({
            type:"define",
            valType:p.type,
            name:{
              type:"word",line:-1,column:-1,
              value:"__COMPILER_PARAM_"
                +name.value+"_"+p.name.value
            },
            value:{
              type:"null",value:"null",
              line:-1,column:-1
            }
          });
        }
      } else misc.error("Stack functions aren't done yet :(",name);
      //return
      o.push({
        type:"function",stackless,retType,
        name,params,contents
      });
    } else if(lineType == "namespace"){
      //get name
      let name = line.shift();
      misc.typeCheck(name,"word");
      //get contents
      let contents = line.shift();
      misc.typeCheck(contents,"enclose");
      //parse contents
      contents = parseStructureBlock(contents.contents);
      //return
      o.push({
        type:"namespace",name,contents
      });
    } else {
      misc.error("Expected line start, got \""+lineType+"\"",lineTypeF);
    }
    //check for excess
    if(line.length != 0) misc.error("Excess after expected end of line",line[0]);
  }
  //return
  return o;
}

function parseType(line){
  //get name
  let name = line.shift();
  misc.typeCheck(name,"word");
  //arrays
  let subType;
  if(name.value == "array"){
    //get array type
    subType = line.shift();
    misc.typeCheck(subType,"enclose");
    subType = subType.contents;
    subType = parseType(subType);
    if(subType.rest.length != 0) misc.error("Unexpected remainder in array type",type);
    subType = subType.value;
  }
  //return
  return {value:{name,subType},rest:line};
}

function parseValue(value){
  //check for compound value
  if(value.type == "enclose"){
    if(value.bound == "{"){
      //struct value
      let valO = [];
      value = value.contents;
      //parse
      while(value.length != 0){
        //get slot name
        let name = value.shift();
        misc.typeCheck(name,"word");
        //remove :
        misc.typeCheck(value.shift(),"token",":");
        //get value
        let val = parseValue(value.shift());
        //remove end-of-line
        if(value.length != 0){
          misc.typeCheck(value.shift(),"token",",");
        }
        //return
        valO.push({name,value:val});
      }
      //return
      value = {type:"struct",value:valO};
    } else if(value.bound == "["){
      //array value
      let valO = [];
      value = value.contents;
      //parse
      while(value.length != 0){
        //get value
        valO.push(parseValue(value.shift()));
        //remove end-of-line
        if(value.length != 0){
          misc.typeCheck(value.shift(),"token",",");
        }
      }
      //return
      value = {type:"array",value:valO};
    }
  } else if(!(
    value.type == "word" ||
    value.type == "string"
  )){
    misc.error("Expected word, string, or enclose, but got "+value.type,value);
  }
  //numbers, hex, binary, and null
  if(value.type == "word"){
    if(/^\d+$/.test(value.value)){
      //decimal
      value.type = "number";
    } else if(value.value.slice(0,2) == "0x"){
      //hexadecimal
      value.value = convert.hexDec(value.value.slice(2));
      value.type = "number";
    } else if(
      value.value[value.value.length - 1] == "b" &&
      /^[01]+$/
      .test(value.value.slice(0,value.value.length-1))
    ) {
      //binary
      value.value = convert.binDec(
        value.value.slice(0,value.value.length-1)
      );
      value.type = "number";
    } else if(value.value == "null"){
      value.type = "null";
    } else if(value.value == "false"){
      value.type = "number";
      value.value = 0;
    } else if(value.value == "true"){
      value.type = "number";
      value.value = 1;
    }
  }
  //return
  return value;
}

function parseCodeBlock(code){
  let o = [];
  while(code.length > 0){
    //get line
    let line = [];
    while(
      code[0].type != "token"
      || code[0].value != ";"
    ){
      line.push(code.shift());
      if(code.length == 0){
        misc.error("Unexpected end of block, after",line.pop());
      }
    }
    if(line.length == 0)
      misc.error("Zero-length line",code[0]);
    code.shift();
    //parse
    o.push(parseCodeLine(line));
  }
  //return
  return o;
}

function parseCodeLine(line){
  let o = [];
  //get line type
  let lineTypeF = line.shift();
  let lineType = lineTypeF.value;
  //parse line
  if(lineType == "asm"){
    //get string
    let str = line.shift();
    misc.typeCheck(str,"string");
    //return
    o.push({type:"asm",value:str});
  } else if(lineType == "define"){
    //get type
    let type = parseType(line);
    line = type.rest;
    type = type.value;
    //get name
    let name = line.shift();
    misc.typeCheck(name,"word");
    //remove =
    misc.typeCheck(line.shift(),"token","=");
    //get starting value
    let value = parseValue(line.shift());
    //return
    o.push({
      type:"define",valType:type,name,value
    });
  } else if(lineType == "for"){
    //parse params
    let params = line.shift();
    misc.typeCheck(params,"enclose");
    params = params.contents;
    let init = [];
    while(
      params[0].type != "token"
      || params[0].value != ";"
    ) {
      init.push(params.shift());
    }
    params.shift();
    let condition = [];
    while(
      params[0].type != "token"
      || params[0].value != ";"
    ) {
      condition.push(params.shift());
    }
    params.shift();
    init = parseCodeLine(init);
    condition = parseExpression(condition);
    let update = parseCodeLine(params);
    //parse body
    let body = line.shift();
    misc.typeCheck(body,"enclose");
    body = parseCodeBlock(body.contents);
    //return
    o.push({
      type:"for",init,condition,update,body
    });
  } else if(lineType == "if"){
    let chain = [];
    //parse if
    let condition = line.shift();
    misc.typeCheck(condition,"enclose");
    condition = parseExpression(condition.contents);
    let body = line.shift();
    misc.typeCheck(body,"enclose");
    body = parseCodeBlock(body.contents);
    chain.push({type:"if",condition,body});
    //parse elif / elses
    while(line.length > 0){
      //get type
      let typeR = line.shift();
      misc.typeCheck(typeR,"word");
      let type = typeR.value;
      //parse
      if(type == "elif"){
        //elif
        let condition = line.shift();
        misc.typeCheck(condition,"enclose");
        condition = parseExpression(condition.contents);
        let body = line.shift();
        misc.typeCheck(body,"enclose");
        body = parseCodeBlock(body.contents);
        chain.push({type:"elif",condition,body});
      } else if(type == "else"){
        //else
        let body = line.shift();
        misc.typeCheck(body,"enclose");
        body = parseCodeBlock(body.contents);
        chain.push({type:"else",body});
      } else {
        misc.error("Expected \"elif\" or \"else\", got \""+type+"\"",typeR);
      }
    }
    //return
    o.push({type:"if",chain});
  } else if(lineType == "while"){
    //parse condition
    let condition = line.shift();
    misc.typeCheck(condition,"enclose");
    condition = parseExpression(condition.contents);
    //parse body
    let body = line.shift();
    misc.typeCheck(body,"enclose");
    body = parseCodeBlock(body.contents);
    //return
    o.push({type:"while",condition,body});
  } else if(lineType == "call"){
    //get name
    let name = line.shift();
    misc.typeCheck(name,"word");
    //get params
    let params = line.shift();
    misc.typeCheck(params,"enclose");
    //parse params
    params = parseCall(params.contents);
    //return
    o.push({type:"call",name,params});
  } else {
    line.unshift(lineTypeF);
    let end = line[line.length - 1];
    //get dest
    let dest = parseExpression(line);
    //remove =
    let equals = line.shift();
    if(!equals) misc.error(`Unexpected end of set line`,end);
    misc.typeCheck(equals,"token","=");
    //parse expression
    let exp = parseExpression(line);
    //return
    o.push({
      type:"set",dest,exp,
      line:equals.line,
      column:equals.column
    });
  }
  //check for excess
  if(line.length != 0) misc.error("Excess after expected end of line",line[0]);
  //return
  return o[0];
}

function parseExpression(line){
  //parse expression
  let o = [];
  let prev = "operator";
  while(true){
    //get value
    let value = line.shift();
    //check for call / access
    if(value.bound == "("){
      if(prev == "value"){
        //call
        o.push({
          type:"call",params:
          parseCall(value.contents)
        });
      } else {
        //parens
        o.push({
          type:"parenthesis",contents:
          parseExpression(value.contents)
        });
      }
      prev = "value";
    } else if(value.bound == "["){
      //access
      o.push({
        type:"access",index:
        parseExpression(value.contents)
      });
      prev = "value";
    } else if(value.bound == "{"){
      //cast
      o.push({
        type:"cast",
        toType:parseType(value.contents).value
      });
    } else if(value.type == "token"){
      //operator
      o.push({type:"operator",value});
      prev = "operator";
    } else {
      //normal value
      o.push({
        type:"value",value:parseValue(value)
      });
      prev = "value";
    }
    //possible end
    if(
      line.length == 0 || 
      (line[0].type == "token" && line[0].value == "=")
    ) break;
  }
  //determine precidence
  return o;
}

function parseCall(params){
  //split
  let args = [];
  let cur = [];
  for(let p of params){
    if(p.type == "token" && p.value == ","){
      args.push(cur);
      cur = [];
    } else {
      cur.push(p);
    }
  }
  if(cur.length != 0) args.push(cur);
  //parse args
  args = args.map(parseExpression);
  //return
  return args;
}

//export
module.exports = {lex,parseStructureBlock};
