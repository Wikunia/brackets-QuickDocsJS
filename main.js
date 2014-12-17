var language = brackets.getLocale().substr(0,2);

define(function(require, exports, module) {
     "use strict";
 
    var KeyBindingManager 	= brackets.getModule("command/KeyBindingManager"),
    EditorManager 			= brackets.getModule("editor/EditorManager"),
    DocumentManager 		= brackets.getModule("document/DocumentManager"),
    ExtensionUtils 			= brackets.getModule("utils/ExtensionUtils"),
	JSUtils                 = brackets.getModule("language/JSUtils"),
	FileSystem          	= brackets.getModule("filesystem/FileSystem"),
	FileUtils           	= brackets.getModule("file/FileUtils"),
	PerfUtils           	= brackets.getModule("utils/PerfUtils"),
	ProjectManager          = brackets.getModule("project/ProjectManager"),
	LanguageManager         = brackets.getModule("language/LanguageManager"),
	QuickOpenJS				= require('QuickOpenJS');

    var ExtPath = ExtensionUtils.getModulePath(module);
    
	var JS_CLASSES 			= ["Array","global","Math","RegExp","Statements","String","window"];
	var NODE_CLASSES 		= ['child_process','cluster','console','crypto','dns','domain','fs','http',
							   'https','net','os','path','process','punycode','querystring','readline','repl','timers',
						   		'tls','tty','dgram','url','util','vm','zlib'];
	var NODE_WOUT_IMPORT 	= ['console'];

    // Extension modules
    var InlineDocsViewer = require("InlineDocsViewer");
    
    function inlineProvider(hostEditor, pos) {
		var result = new $.Deferred();

        // get editor content
        var currentDoc = DocumentManager.getCurrentDocument().getText();
       
		var docDir = FileUtils.getDirectoryPath(hostEditor.document.file.fullPath);
        // get programming language
        var langId = hostEditor.getLanguageForSelection().getId();
        
        // Only provide docs when cursor is in javascript content
        if (langId !== "javascript" && langId !== "coffeescript" && langId !== "livescript") {
            return null;
        }
        
        // no multiline selection
        var sel = hostEditor.getSelection();
        if (sel.start.line !== sel.end.line) {
            return null;
        }
        
        var currentModDir = getcurrentModDiruleDir(docDir,currentDoc);
        
        // get func.name and func.type ('.' or 'Math.')
        var func = get_func_name(currentDoc,sel.start,currentModDir);
		// console.log('func: ',func);
				
        // if a function was selected
        if (func) {
			func.nodeJS = false;
            var func_class,url,JQueryDocName;
			var tags = false;
            if (!("mod" in func)) {
				var jsTags = getJSTagsNoMod(func);
				if (jsTags) {
					tags 		= jsTags.tags;
					func_class 	= jsTags.func_class;
					url 		= jsTags.url;
				}
				
				// if tags for JS functions aren't available
				if (!tags) {
					// => check current document for user defined function
					var tags = get_userdefined_tags(currentDoc,func);
					func_class = 'user_defined';
					url = false;
				} else if (typeof(url) === "undefined") {
					url = true;
				}
				if (tags) {
					if (tags.s != "" || tags.p) {
						var inlineViewer = sendToInlineViewer(hostEditor,tags,func,url);
						inlineViewer.done(function(inlineWidget) {
							result.resolve(inlineWidget);
						});
					} else {
						result.reject();
					}
				} else {
					// try to find the function in other files
					tryJSUtils(func).done(function(data) {
						tags = data;
						var url = false;
						var inlineViewer = sendToInlineViewer(hostEditor,tags,func,url);
						inlineViewer.done(function(inlineWidget) {
							result.resolve(inlineWidget);
						});
					}).fail(function(errorCode) {
						result.reject();
					});
				}
			} else {
				// the current function is defined in a module
				var modContent = getModuleContent(func.mod,currentModDir);
				modContent.done(function(content) {
					var tags = get_userdefined_tags(content,func);
					if (tags) {
						url = false;
						var inlineViewer = sendToInlineViewer(hostEditor,tags,func,url);
						inlineViewer.done(function(inlineWidget) {
							result.resolve(inlineWidget);
						}).fail(function() {
							result.reject();
						});
					} else {
						result.reject();
					}
				}).fail(function(errorCode) {
					if (errorCode == "noFile") {
						// try nodeJS
						if (NODE_CLASSES.indexOf(func.variable_type) >= 0) {
							tags = getTags(func,'nodejs/'+func.variable_type);
							func_class = "NodeJS/"+func.variable_type;
							if (tags && tags.y) {
								url = createNodeUrl(func.variable_type,tags);
								func.nodeJS = true;
								var inlineViewer = sendToInlineViewer(hostEditor,tags,func,url);
								inlineViewer.done(function(inlineWidget) {
									result.resolve(inlineWidget);
								});
							}
						}
					}
					if (!tags) {
						tryJSUtils(func).done(function(data) {
							tags = data;
							url = false;
							var inlineViewer = sendToInlineViewer(hostEditor,tags,func,url);
							inlineViewer.done(function(inlineWidget) {
								result.resolve(inlineWidget);
							});
						}).fail(function(errorCode) {
							result.reject();
						});
					}
				});
			}
			if (result.state() == "rejected") {
				return null;
			}
			return result.promise();
        } else {
        	return null;
		}


		function createNodeUrl(nodeClass,tags) {
			var result = 'http://nodejs.org/docs/v0.10.32/api/'+nodeClass+'.html';
			result += '#'+nodeClass+'_';
			result += tags.y.replace(/[ ,-.\[\]()]+/g,'_').replace(/_+$/,'').toLowerCase();
			return result;
		}

		function createJQueryUrl(JQueryDocName) {
			var result = 'http://api.jquery.com/'+JQueryDocName;
			return result;
		}

		function tryJSUtils(func) {
			var result = $.Deferred();
			QuickOpenJS.findFunctionInProject(func.name).done(function(functionArray) {
				var content = getContentSync(functionArray.document.file._path);
				var tags = get_userdefined_tags(content,func);
				if (tags) {
					result.resolve(tags);
				} else {
					result.reject();
				}
			}).fail(function(errorCode) {
				result.reject();
			})
			return result.promise();
		}

		function tryJQuery(func) {
			var tags = false;
			if (func.variable == "$") {
				JQueryDocName = 'jQuery.'+func.name;
				tags = getTags(func,'jquery/jQuery');
			} else {
				JQueryDocName = func.name;
				tags = getTags(func,'jquery/element');
				if (!tags) {
					JQueryDocName = 'event.'+func.name;
					tags = getTags(func,'jquery/event');
				}
			}
			return tags;
		}
	
		function sendToInlineViewer(hostEditor,tags,func,url) {
			var result = new $.Deferred();
			if (tags.s != "" || tags.p) {
				var summary = tags.s;
				var syntax = tags.y.replace(/\n/g,'<br>');
				// indent code if it has space(s) at the beginning of the line
				syntax = syntax.replace(/<br>\s(.*?).(.*?)(<br>|$)/g,'<br><p style="margin:0 auto; text-indent:2em;">$2</p>');


				// check if function has parameters
				if (tags.p) {
					var parameters = tags.p;
				} else {
					var parameters = eval("[{}]");
				}
				// if___else and some other functions back to if...elese
				func.name = func.name.replace(/___/,'...');

				// generate url for read more if func_class isn't user_defined
				if (url === true) {
					url = func_class+'/'+func.name;
				}

				if (tags.r) {
					if (typeof tags.r.d == 'undefined') {
						tags.r = {d:tags.r,type:''};
					}
				} else {
					tags.r = {};
				}

				var inlineWidget = new InlineDocsViewer(
									func.name,
									{
										SUMMARY:summary,SYNTAX: syntax,RETURN: tags.r, URL:url, VALUES:parameters
									}
								);
				inlineWidget.load(hostEditor);
				result.resolve(inlineWidget);
			} else result.reject();
			return result.promise();
		}
			
		
		/**
		 * Get JS Tags for jQuery,NodeJS,ReactJS or basic JS functions without module functions 
		 * @param   {Object}         func the func object with .variable_type and .name
		 * @returns {Boolean|Object} false if there are no tags otherwise {tags: tags, func_class: func_class, url: url}
		 */
		function getJSTagsNoMod(func) {
			var url;
			var func_class;
			switch(func.type) {
				case ".":
					switch(func.variable_type) {
						// if variable type is unknown
						case "unknown":
							// try jQuery
							tags = tryJQuery(func); // no $.Deferred
							if (tags) {
								func_class = "jQuery/"+func.name;
								url = createJQueryUrl(JQueryDocName);
							} else if (NODE_WOUT_IMPORT.indexOf(func.variable) >= 0) {
								tags = getTags(func,'nodejs/'+func.variable);
								func_class = "NodeJS/"+func.variable;
								url = createNodeUrl(func.variable,tags);
							} else {
								tags = getTags(func,"String");
								func_class = "Global_Objects/String";
								if (!tags) { // try array functions
									tags = getTags(func,"Array");
									func_class = "Global_Objects/Array";
								}
								if (!tags) { // try RegExp functions
									tags = getTags(func,"RegExp");
									func_class = "Global_Objects/RegExp";
								}
							}
							break;
						case "$.Deferred": // jQuery
							tags = getTags(func,'jquery/deferred');
							if (tags) {
								func_class = "jQuery/"+func.name;
								url = createJQueryUrl('deferred.'+func.name);
							}
							break;
						default:
							if (JS_CLASSES.indexOf(func.variable_type) >= 0) {
								tags = getTags(func,func.variable_type);
								func_class = "Global_Objects/"+func.variable_type;
							}
					}
					break;
				case "Math.": // Math functions
					tags = getTags(func,"Math");
					func_class = "Global_Objects/Math";
					break;
				case "RegExp.": // RegExp functions
					tags = getTags(func,"RegExp");
					func_class = "Global_Objects/RegExp";
					break;
				case "window.": // Window functions
					tags = getTags(func,"window");
					func_class = "API/Window";
					url = 'https://developer.mozilla.org/en-US/docs/Web/API/Window.'+func.name;
					break;
				default:
					tags = getTags(func,"Statements");
					func_class = "Statements";
					if (!tags) {
						tags = getTags(func,"global");
						func_class = "Global_Objects";
					}
					if (!tags) {
						tags = getTags(func,"window");
						func_class = "API/Window";
						url = 'https://developer.mozilla.org/en-US/docs/Web/API/Window.'+func.name;
					} 
					if (!tags) {	
						tags = getTags(func,'reactjs/component');
						func_class = "component/"+func.variable;		
						url  = (tags && "url" in tags) ? tags.url : false;
					}
			}
			if (!tags) return false;
			return {tags: tags, func_class: func_class, url: url};
		}
    }
    
    /**
     * Read the type.json file and return tags
     * @param   {Object} func function includes func.name
     * @param   {String} type function type where to finde the json file inside the dir "docs" i.e Array or nodejs/assert
     * @returns {Object} tags if the function exists, null otherwiese
     */
    function getTags(func,type) {
        // Initialize the Ajax request
        var xhr = new XMLHttpRequest();
        
        // open json file (synchronous) 
        xhr.open('get', ExtPath+'docs/'+type+'.json', false);
            
        // Send the request 
        xhr.send(null);

        if(xhr.status === 0){
            // function information is available
            var tags = JSON.parse(xhr.responseText);
            tags = eval('tags.'+func.name);

            // if the function exists
            if (tags) {
                return tags;
            }
        }
        
        return null;
    }


    /**
     * Gets the function name and the type of the function
     * @param   {string} content    content of document
     * @param   {Object} pos        cursor position
     *                              (pos.ch and pos.line)
     * @param   {string} currentModDir currentModDirule directory
     * @returns {object} (func.name,func.type,func.variable,func.variable_type)
     */
    function get_func_name(content,pos,currentModDir) {
        // get the content of each line
        var lines = content.split("\n");
        // get the content of the selected line
        var line = lines[pos.line];
        // get string after current position
        var line_after = line.substr(pos.ch);
        // get string before current position
        var line_begin = line.substr(0,pos.ch);
        // reverse the string before current position
        var line_begin_rev = reverse_str(line_begin);
        
        
        // characters which can be part of a function name
        var function_chars = '0123456789abcdefghijklmnopqrstuvwxyz_';
        
        var e = 0;
        while (function_chars.indexOf(line_after.substr(e,1).toLowerCase()) !== -1 && e < line_after.length) {
            e++;
        }
        
        var b = 0;
        while (function_chars.indexOf(line_begin_rev.substr(b,1).toLowerCase()) !== -1 && b < line_begin_rev.length) {
            b++;
        }
        
        var func_start_pos = pos.ch-b;
        var func_name_length = b+e;

        // if the cursor is not on the function name but on the part before the dot
        if (line_after.substr(e,1) === "[") {
            while (line_after.substr(e,1) !== ']') {
                e++;   
            }
            // not matching the ] but the char afterwards
            e++;
        }
        
        
        // Check if a dot is after the function name
        if (line_after.substr(e,1) === ".") {
            e++;
            // new start position
            func_start_pos = e+pos.ch;
            
            
            line_after = line.substr(e+pos.ch);
            // get string before current position
            line_begin = line.substr(0,e+pos.ch);
            // reverse the string before current position
            line_begin_rev = reverse_str(line_begin);

            e = 0;
            while (function_chars.indexOf(line_after.substr(e,1).toLowerCase()) !== -1 && e < line_after.length) {
                e++;
            }
            // new function length
            func_name_length = e;
            b = 0;
        }
        
        
        // characters which can't be directly before the function_name
        var no_function_chars = '0123456789$';
        if (no_function_chars.indexOf(line_begin_rev.substr(b,1)) === -1 || b == line_begin_rev.length) {
            var func = new Object();
            func.name = line.substr(func_start_pos,func_name_length);

            // check if function is like abc.substr or only like eval (no point)
            if (line_begin_rev.substr(b,1) == ".") {
                func.type = ".";   
				if (line_begin_rev.substr(b,7) == ".wodniw") {
					func.type = "window.";
				} else if (line_begin_rev.substr(b,5) == ".htaM") { // Math. reverse
                    func.type = "Math.";
                } else if (line_begin_rev.substr(b,7).search(/\.'(g|m|i|y){0,4}\//) !== -1) { // regex with g,m,i,y flags reverse
                    func.type = "RegExp.";
                }
                // if it is no Math or RegExp function => try to get the type
                if (func.type == ".") {
                    // get the variable name (i.e strname.indexOf => variable name = "strname")
                    // characters which can't be part of a variable name
                    var no_variable_chars = ' =,+-(';
                    var v = b+1;
                    while (no_variable_chars.indexOf(line_begin_rev.substr(v,1).toLowerCase()) === -1 && v < line_begin_rev.length) {
                        if (line_begin_rev.substr(v,1).toLowerCase() == ')') {
                            no_variable_chars = ''; // inside brackets everything is possible :D 
                        }
                        if (line_begin_rev.substr(v,1).toLowerCase() == '(') {
                            no_variable_chars = ' =,+-('; // old no_variable_chars
                        }
                        v++;
                    }
                    // func.variable could look like abc.substr(0,1) if the function was abc.substr(0,1).indexOf('') 
                    func.variable = line.substr(func_start_pos+b-v,v-b-1);

                    // delete function names inside func.variables
                    // split variable into parts
                    var func_variable_parts = func.variable.split(".");
                    // the first part can't be a function
                    func.variable = func_variable_parts[0];
                    // iterate through all other parts
                    for (var i = 1; i < func_variable_parts.length; i++) {
                        // if part has no parmaters and isn't 'lengt' => part of variable 
                        if (func_variable_parts[i].indexOf('(') === -1 && func_variable_parts[i] !== "length") {
                            func.variable += '.'+func_variable_parts[i];
                        } else {
                            // if part is function => next part must be a function as well
                            break;
                        }
                    }
					func.variable = func.variable.trim();

                    var var_param = func.variable.indexOf('[');
                    // if variable is sth like abc[i] it can be an array or a string
                    if (var_param !== -1) {
                        // can be string and array
                        func.variable_type = 'unknown';
                    } else {
                         // try to get the VariableType ('String','Array','RegExp','unknown'
						var varType = getVariableType(content,func.variable,pos,currentModDir);
                        func.variable_type = varType.type;
						if (varType.mod) {
							func.mod = varType.mod;
						}
                    }

                }
            } else {
                // some function names have different options
                switch(func.name) {
                    case "for":
                        if (line_after.indexOf(' of ') !== -1) {
                            func.name = "for___of";
                        }
                        if (line_after.indexOf(' in ') !== -1) {
                            func.name = "for___in";
                        }
                        break;
                    case "if":
                        func.name = "if___else";
                        break;
                    case "try":
                        func.name = "try___catch";
                        break;
                    case "do":
                        func.name = "do___while";
                        break;
                }
            }
			// if func name starts with a letter or an underscore or $
			if (func.name.charAt(0).match(/[\$a-zA-Z_]/)) {
            	return func;
			} else {
				return null;
			}
        }
        
        return null;
    }
    
    /**
     * get the type of a variable or the module
     * it's important for functions which exists for strings and arrays
     * @param   {String} content       content of document
     * @param   {String} variable      name of the variable
     * @param   {Object} pos           current cursor position
     * @param   {String} currentModDir currentModDirule directory (empty if no requirejs)
     * @returns {Object} (type of the variable: unknown,String,Array or RegExp, mod: modul name else '')
     */
    function getVariableType (content, variable,pos, currentModDir) {
        // get the declaration for this variable 
        // can be a ',' between two declarations
        var regex = new RegExp('var (?:\\s*?|[^;]*?,\\s*?)' + variable + '\\s*?=','');
        var match = regex.exec(content);

        if (match) {
            var pos = match.index;
            // length of the match
            var match_len = match[0].length;
        } else {
            // if the declaration is not available in this content
			regex = new RegExp('\[\\s,\]' + variable + '\\s*?=','');
        	match = regex.exec(content);
			if (match) {
				var pos = match.index;
				// length of the match
				var match_len = match[0].length;
        	} else {
				// could be a function parameter
				// check for requirejs (define)
				var before = content.split("\n",pos.line);
				var result = getModuleForVariable(content,before,variable);
				if (result && "mod" in result) {
					return result;
				}

				for (var i = before.length-1; i >= 0; i--) {
					if (before[i].indexOf('function') !== -1) break;
				}
				var functionLine = before[i];
				var regex = /(var (.*)=[ \(]*?function(.*)|function (.*?)|(.*?):\s*?function(.*?)|(.*?)\.prototype\.(.*?)\s*?=\s*?function(.*?))(\n|\r|$)/gmi;

				var matches = null;
				while (matches = regex.exec(functionLine)) {
					// matches[0] = all
					// matches[2] = '''function_name''' or matches[4] if matches[2] undefined or matches[5] if both undefined
					// get the function name
					// start_pos
					if (matches[2]) {
						var match_func = matches[2].trim();
					} else if (matches[4]) {
						var match_func = matches[4].trim();
					} else if (matches[5]) {
						var match_func = matches[5].trim();
					}  else if (matches[8]) {
						var match_func = matches[8].trim();
					} else {
						break;
					}
					var end_func_name = match_func.search(/( |\(|$)/);
					// the variable must be a parameter
					if (match_func.substr(end_func_name).indexOf(variable) !== -1 || (matches[9] && matches[9].indexOf(variable) !== -1)) {
						var match_func = match_func.substring(0,end_func_name).trim();

						var func = {name: match_func};
						if (matches[7]) {
							func.variable_type = matches[7];
						}
						var tags = get_userdefined_tags(content,func);

						if (tags) {
							for (var t = 0; t < tags.p.length; t++) {
								if (tags.p[t].t == variable) {
									var type = tags.p[t].type;
									type = type.substr(0,1).toUpperCase() + type.substr(1);
									return {type:type};
									break;
								}
							}
						}
					}
				}

				return {type:'unknown'};
			}
		}

    
        // get declaration value
        // substr(pos).search(regex)+pos = indexOf(regex,pos)
        var value = content.substr(pos+match_len,content.substr(pos+match_len).search(/[;,]/));
        value = value.trim();

		// check for 'new' declaration
		var newRegex = /^new\s+?((\$\.?)?[a-z]*)/i;
		var objectName = newRegex.exec(value);
		if (objectName) {
			var before = content.split("\n",pos.line);
			var result = getModuleForVariable(content,before,objectName[1]);
			if (result.mod) {
				return result;
			} else {
				return {type:objectName[1]};
			}
		}

		// check for normal 'require' declaration i.e var variable = require('...')
		var requireRegex = /^require\('(.*?)'\)/;
		var requireName = requireRegex.exec(value);
		if (requireName) {
			var before = content.split("\n",pos.line);
			var result = getModuleForVariable(content,before,requireName[1]);
			if (result.mod) {
				return result;
			} else {
				return {type:requireName[1]};
			}
		}

        // split the declaration into parts
        var value_parts = value.split(".");
        // if the declaration is like variablename.function[.function,...]
        if (value_parts.length >= 2) {
			if (value_parts[0] == '$') {
				if (value_parts[1].indexOf('Deferred(') == 0) {
					return {type:'$.Deferred'};
				}
			}

            // iterate through the parts starting with the functions
            for (var i = 1; i < value_parts.length; i++) {
                // get positon of the parameter part for this function
                var func_param_pos = value_parts[i].indexOf('(');
                // if the function has parameter => get function name
                if (func_param_pos !== -1) {
                    var func = value_parts[i].substr(0,func_param_pos);
                } else {
                    var func = value_parts[i];   
                }
                // all functions that outputs a string
                var makes_string = ',substr,substring,search,concat,replace,trim,big,blink,bold,';
                makes_string += 'fixed,fontcolor,fontsize,italics,link,small,strike,sub,sup,join,pop,push,';
                if (makes_string.indexOf(','+func+',') !== -1) {
                    return {type:'String'};
                }
                // all functions that outputs an array
                if (',split,match,reverse,sort,map,'.indexOf(','+func+',') !== -1) {
                    return {type:'Array'};
                }
            }
        } else { // if the declaration has no function parts
            // array can be declared with new Array or []
            if (value.indexOf('new Array') !== -1 || (value.substr(0,1) == '[') ) {
                return {type:'Array'};
            }
            if (value.indexOf('new RegExp') !== -1) {
                return {type:'RegExp'};
            }
			if (value.indexOf('this') !== -1) {
				return {type:'this'};
			}

            // checks '/anc/flags' and "/anc/flags" => RegExp
            var regex_end = new RegExp("\/(g|m|i|y){0,4}'");
            var regex_end2 = new RegExp('\/(g|m|i|y){0,4}"');
            if ((value.substr(0,2) == "'/" && value.substr(-6,6).search(regex_end) !== -1) ||
               (value.substr(0,2) == '"/' && value.substr(-6,6).search(regex_end2) !== -1)) {
                return {type:'RegExp'};
            }
            
            // checks 'str' and "str"
            if ((value.substr(0,1) == "'" && value.substr(-1,1) == "'") || (value.substr(0,1) == '"' && value.substr(-1,1) == '"')) {
                return {type:'String'};
            }
        }
        return {type:'unknown'};
    }
    
	/**
	 * Get the correct module for a specific variable
	 * @param   {String} content  content of the current document
	 * @param   {Array}  before   lines before current cursor Pos
	 * @param   {String} variable module variable
	 * @returns {module} module
	 */
	function getModuleForVariable(content,before,variable) {
		// check for define requires
		var DEFINE_REGEX = /define\s*?\(\s*?(?:'(?:.*?)'\s*,\s*)?\[/mi;

		if (DEFINE_REGEX.test(before.join('\n'))) {
			for(var i = 0; i < before.length; i++) {
				if (before[i].indexOf('define') !== -1) {
					var defineLine = i;
					break;
				}
			}

			var definePos = content.indexOf('define');
			var define = content.substr(content.indexOf('(',definePos)+1);

			var funcLine = false;
			for(var j = defineLine; j < before.length; j++) {
				var funcPos;
				if ((funcPos = before[j].indexOf('function')) !== -1) {
					funcLine = j;
					break;
				}
			}
			if (funcLine !== false) {
				var functionLine = before[funcLine];
				var paramPos;
				if ((paramPos = functionLine.indexOf(variable)) !== -1) {
					// get the correct require module
					// -> which parameter number?
					var afterFunc = functionLine.substr(funcPos);
					afterFunc = afterFunc.substring(afterFunc.indexOf('(')+1,afterFunc.indexOf(')'));
					var params = afterFunc.split(',');
					var paramNr = false;
					for (var p = 0; p < params.length; p++) {
						if (params[p].trim() == variable) {
							paramNr = p;
							break;
						}
					}
				}
			}
			if (paramNr !== false) {
				// get the correct module name
				var modulRegEx = /([^,]*?,\s*?\[([^\]]*?)\]|\s*?\[([^\]]*?)\])/gmi;
				var modules = modulRegEx.exec(define);
				var moduleError = false;
				if (modules[2]) {
					modules = modules[2];
				} else if (modules[3]) {
					modules = modules[3];
				} else {
					moduleError = true;
				}
				if (!moduleError) {
					modules = modules.substring(modules.indexOf("'")+1,modules.lastIndexOf("'"));
					// correct module name:
					modules = modules.split(/'\s*?,\s*?'/);
					return {type: modules[paramNr], mod: modules[paramNr]};
				}
			}
		} else { // maybe it's only a require
			// check for // variable	   = require('...');
			var REGEX_REQUIRE = new RegExp('\[\\s,\]' + variable + '\\s*=\\s*require\\(\'(.*?)\'\\)');
			var match = REGEX_REQUIRE.exec(before);
			if (match) {
				return {type: match[1], mod: match[1]};
			}
		}
		return false;
	}

	/**
    * user defined functions can documentated with JavaDoc
    * @param content
    * @param func       {object}  function (includs func.name)
    * @return tags object
    */
    function get_userdefined_tags(content,func) {
        var tags = new Object();
		
		// global is important for while!
		var regexComment	 = /\/\*\*(?:[ \t]*)[\n\r](?:[\s\S]*?)\*\/([^{]*?)\{/g;
	
		var tabsLinesBetween = /^(?:[ \t<]*)[\n\r]*?(?:[ \t]*)/;
		var functionDefs 	 = /(var (.*)=\s*(?:function(.*)|React.createClass\s*\((?:.*))|function (.*?)|(.*?):\s*?function(.*?)|([^.]*?)\.(prototype\.)?([^.]*?)\s*?=\s*?function(.*?))/;
		var end				 = /(\n|\r|$)/;
		
		// multiline,caseinsensitive
		var regex = new RegExp(tabsLinesBetween.source + functionDefs.source + end.source , 'mi');
	
		var matches 		= null;
		var multicomment 	= null;
        while (multicomment = regexComment.exec(content)) {
			matches = regex.exec(multicomment[1]);
			// matches[0] = all
			// matches[2] = '''function_name''' or matches[4] if matches[2] undefined or matches[5] if both undefined
			// get the function name
			// start_pos
			for (var i = 0; i < matches.length; i++) {
				if (matches[i]) {
					matches[i] = matches[i].trim();
				}
			}
			if (matches[2]) {
				var match_func = matches[2].trim();
			} else if (matches[4]) {
				var match_func = matches[4].trim();	
			} else if (matches[5]) {
				var match_func = matches[5].trim();
			}  else if (matches[7]) {
				// prototype or static
				if (matches[7] == func.variable_type && matches[8] == "prototype.") {
					var match_func = matches[9];
				} else if (matches[7] == func.variable && !matches[8]) {
					var match_func = matches[9];
				} else {
					continue; // try next function
				}
			} else {
				break;
			}
			var end_func_name = match_func.search(/( |\(|$)/);
			if (end_func_name >= 0) {
				match_func = match_func.substring(0,end_func_name).trim();
			}
			if (match_func === func.name) {
				var lines  = multicomment[0].split(/[\n\r]/);
				// get the comment without * at the beginning of a line
				var comment = '';
				lines = lines.slice(1);  // without the / * * at the end /beginning
				for (var i = 0; i < lines.length; i++) {
					lines[i] = lines[i].trim(); // trim each line
					if (lines[i].substr(0,2) == "*/") { lines = lines.slice(0,i); break; }
					lines[i] = lines[i].replace(/^\*/,'').trim(); // delete * at the beginning and trim line again
				}
				comment = lines.join('\n');
				var commentTags = comment.split(/[\n]\s*@/);



				tags.s = commentTags[0].replace(/\r?\n/g, '<br />'); // the first (without @ is the description/summary)
				tags.y = ''; // no syntax for userdefined functions

				var params = [];
				for (var i = 1; i < commentTags.length; i++) {
					// get params
					if (commentTags[i].substr(0,5) === 'param') {
						var param_parts = commentTags[i].split(/(\s)+/);

						var param_type = '';
						var delimiters = param_parts.filter(function(v,i) { return ((i % 2) === 1); });
						param_parts = param_parts.filter(function(v,i) { return ((i % 2 === 0)); });


						// 0 = param, 1 = title, 2-... = description
						// 1,2 can be the type (inside {})
						if (param_parts[2]) {
							if (param_parts[1].substr(0,1) == '{' && param_parts[1].substr(-1) == '}') {
								// type is part of the title
								param_parts[1] = param_parts[1].substring(1,param_parts[1].length-1); // remove { }
								var param_title = param_parts[2];
								param_type = param_parts[1];
								var description = param_parts[3];
								var j_start = 4;
							} else 	if (param_parts[2].substr(0,1) == '{' && param_parts[2].substr(-1) == '}') {
								// type is part of the title
								param_parts[2] = param_parts[2].substring(1,param_parts[2].length-1); // remove { }
								var param_title = param_parts[1];
								param_type = param_parts[2];
								var description = param_parts[3];
								var j_start = 4;
							} else {
								var param_title = param_parts[1]; 
								var description = param_parts[2];
								var j_start = 3;
							}
							for (var j = j_start; j < param_parts.length; j++) {
								description += delimiters[j-1] + param_parts[j];
							}
						} else {
							var param_title = param_parts[1];
							var description = '';	
						}
						var optional = false;
						var defaultValue;
						// a param title can start with a [ and ends with ] => optional parameter
						if (param_title.charAt(0) == '[' && param_title.charAt(param_title.length-1) == ']') {
							optional = true;
							param_title = param_title.substring(1,param_title.length-1);
							var optional_parts = param_title.split('=');
							if (optional_parts.length == 2) {
								param_title = optional_parts[0];
								defaultValue = optional_parts[1];
							}
						}

						params.push({
							't':param_title,
							'd':(typeof description === "undefined") ? '' : description.replace(/\r?\n/g,'<br />'),
							'type':param_type,
							'optional':optional,'default':defaultValue
						});
					}
					if (commentTags[i].substr(0,6) === 'return') {
						if (commentTags[i].substr(0,7) === 'returns') {
							var  return_tag = commentTags[i].substr(7).trim(); // delete returns and trim
						} else {
							var  return_tag = commentTags[i].substr(6).trim(); // delete return and trim
						}
						if(return_tag.charAt(0) == '{') {
							var endCurly = return_tag.indexOf('}');
							tags.r = {'d': return_tag.substr(endCurly+1),'type':return_tag.substring(1,endCurly)};
						}else {
							tags.r = return_tag;
						}
					}
				}
				tags.p = params;
				return tags;
			 }
		}
        return null;   
    }
   

	/**
	 * Get the content of a special modul
	 * For that iterate through all js files
	 * @param   {String} moduleName name of the js module
	 * @param   {String} moduleDir  module directory {@link findFunctionInProject}
	 * @returns {String} The content of the js module file
	 */
	function getModuleContent(moduleName,moduleDir) {
	    function getJSFiles(file) {
            if (file._name.substr(-3) == ".js") return true;
        }
        var result = new $.Deferred();
        ProjectManager.getAllFiles(getJSFiles)
            .done(function (files) {
				// sort files to make it faster
				// if the js file name contains the module name it's more relevant
				var sortedFilesTop = [];
				var sortedFilesBottom = [];
				var sortedFiles = [];
				var content = false;
				files.forEach(function(file) {
					if (file._path == (moduleDir+moduleName+'.js')) {
						content = getModuleContentIterator(file,moduleName);
						return true;
					}
				});
				if (content) {
					return result.resolve(content);
				} else {
					result.reject('noFile');
				}
			})
			.fail(function () {
				result.reject();
			});
		return result.promise();
	}

	/**
	 * Get the content of a special module name
	 * For that iterate through all js files
	 * @param file file by ProjectManager.getAllFiles
	 * @param moduleName name of the js class
	 * @return content The content of the php class file
	 */
	function getModuleContentIterator(file,moduleName) {
		var result = '';
		moduleName = moduleName.addSlashes();
		if (file) {
			if (file._isDirectory == false) {
				if (file._name.substr(-3) == ".js") {
					if (file._contents) {
						result = file._contents;
					} else {
						result = getContentSync(file._path);
					}
				}
			}
		}
		if (result) {
			return result;
		}
		return false;
	}
    
	function getContentSync(filePath) {
		var xhr = new XMLHttpRequest();
		// false => synchron
		xhr.open('get',filePath, false);

		// Send the request
		xhr.send(null);

		if(xhr.status === 0){
			return xhr.responseText;
		} else return false;
	}

	/**
	 * Get the directory of the current requirejs module
	 * @param {string} docDir current directory
	 * @param {string} content content of the current file
	 */
	function getcurrentModDiruleDir(docDir,content) {
		var match = /define\s*?\(\s*?'(.*?)'/gmi;
		var matches = match.exec(content);

		if (matches) {
			var moduleName = matches[1];
			var lastSlash;
			var moduleDir = moduleName.substr(0,((lastSlash = moduleName.lastIndexOf('/')) !== -1) ? lastSlash+1: moduleName.length);
			moduleDir = reverse_str(reverse_str(docDir).replace(reverse_str(moduleDir),''));
			return moduleDir;
		}
		return docDir;
	}

    /**
        reverse a string
    */
    function reverse_str(s){
        return s.split("").reverse().join("");
    }

	String.prototype.addSlashes = function() {
	  return this
		.replace(/([^\\])\//g, '$1\\\/');
	}


    
    EditorManager.registerInlineDocsProvider(inlineProvider); 
});
