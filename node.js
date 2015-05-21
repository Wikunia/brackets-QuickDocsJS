var fs = require("fs");
var path = require("path");
var ext = "json";
var searchJson = {};
var dirs = ['docs','docs/jquery','docs/nodejs','docs/reactjs'];
for (var i = 0; i < dirs.length; i++) {
    var dir = dirs[i];
    var files = fs.readdirSync(dir);
    files.forEach(function(file) {
        var fileext = path.extname(file);
        if (fileext == ext || fileext == '.'+ext) {
            searchJson = add2SearchJson(searchJson,dir,file);
        }
    });
}
print(searchJson);


function print(json) {
    fs.writeFile("search.json", JSON.stringify(json), function(err) {
		if(err) {
			console.log(err);
		} else {
			console.log("The file was saved (search.json)!");
		}
	}); 
}


function add2SearchJson(searchJson,dir,file) {
    var json = JSON.parse(fs.readFileSync(dir+'/'+file, 'utf8'));

    var summary;
    var word;
    for(fName in json) {
        summary = json[fName].s;
       
        var summaryArr = summary.split(' ');
        var pDescArr = (fName in json && "p" in json[fName] && json[fName].p) ? json[fName].p : [];
        
        var pDescStr = '';
        for (var i = 0; i < pDescArr.length; i++) {
            pDescStr += ' '+pDescArr[i].d+' '+pDescArr[i].t;  
        }
        pDescArr = pDescStr.split(' ');
        
        if (dir == 'docs') {
            fName = file.split('.')[0]+"."+fName;
        } else {
            fName = dir.split('/')[1]+"."+file.split('.')[0]+"."+fName;
        }
       
        var wordArray = summaryArr.concat(pDescArr).concat(fName);
       
        for (var i = 0; i < wordArray.length; i++) {
            word = wordArray[i].toLocaleLowerCase();
             if (word.indexOf('each') >= 0) {
                console.log(fName);
            }
            word = word.replace(/[^a-z]/g,'');
            word += "+";
            if (word != '') {
                if (!(word in searchJson)) {
                    searchJson[word] = [fName];
                } else {
                    if (searchJson[word].indexOf(fName) == -1) { 
                        searchJson[word].push(fName);
                    }
                }
            }
        }
    }
    return searchJson;
}