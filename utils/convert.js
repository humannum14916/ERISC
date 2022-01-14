
const ascii = [
  " ","!","\"","#","$","%","&","'","(",")","*","+",",","-",".","/",
  "0","1","2","3","4","5","6","7","8","9",":",";","<","=",">","?",
  "@","A","B","C","D","E","F","G","H","I","J","K","L","M","N","O",
  "P","Q","R","S","T","U","V","W","X","Y","Z","[","\\","]","^","_",
  "`","a","b","c","d","e","f","g","h","i","j","k","l","m","n","o",
  "p","q","r","s","t","u","v","w","x","y","z","{","|","}","~"
];

function reBase(n,d){
  let result = "";
  let sign = "";
  if(n<0){
    sign = "-";
    n = -n;
  }
  do {
    result = d[n%d.length]+result;
    n = Math.floor(n/d.length);
  } while (n > 0);
  return result + sign;
}

function toASCII(input,output){
  let o = [];

  for(let c of input){
    if(c == "\n"){
      o.push(10);
      continue;
    }
    o.push(ascii.indexOf(c)+32);
  }

  if(output == "print"){
    let o2 = "";
    for(let c of o){
      o2 += "\nTRS "+c+",TTY";
    }
    return o2;
  } else if(output == "data"){
    o.push(0);
    let o2 = "";
    let state = 0;
    for(let c of o){
      if(state == 0){
        state = 1;
        o2 += "\nTRS #"+c;
      } else if(state == 1){
        state = 0;
        o2 += ",#"+c;
      }
    }
    o2 = o2.slice(1);
    if(state == 1){
      o2 += ",#0";
    }
    return o2;
  } else {
    return o;
  }
}

function fromASCII(value){
  return ascii[value-32];
}

function decHex(d){
  return reBase(d,[0,1,2,3,4,5,6,7,8,9,"a","b","c","d","e","f"]);
}

function hexDec(h){
  const values = ["0","1","2","3","4","5","6","7","8","9","a","b","c","d","e","f"];
  let result = 0;
  let hs = h.split("");
  for(let d of hs){
    result *= 16;
    result += values.indexOf(d);
  }
  return result;
}

function binDec(b){
  const values = ["0","1"];
  let result = 0;
  let bs = b.split("");
  for(let d of bs){
    result *= 2;
    result += values.indexOf(d);
  }
  return result;
}

module.exports = {toASCII,fromASCII,decHex,hexDec,binDec};
