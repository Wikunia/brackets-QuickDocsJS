/*
 * Copyright (c) 2012 Adobe Systems Incorporated. All rights reserved.
 *
 * Permission is hereby granted, free of charge, to any person obtaining a
 * copy of this software and associated documentation files (the "Software"),
 * to deal in the Software without restriction, including without limitation
 * the rights to use, copy, modify, merge, publish, distribute, sublicense,
 * and/or sell copies of the Software, and to permit persons to whom the
 * Software is furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
 * FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER
 * DEALINGS IN THE SOFTWARE.
 *
 */

/*jslint vars: true, plusplus: true, devel: true, nomen: true, regexp: true, indent: 4, maxerr: 50 */
/*global define, $, brackets */



define(function (require, exports, module) {
    "use strict";

    var EditorManager       = brackets.getModule("editor/EditorManager"),
    	Editor				= brackets.getModule("editor/Editor"),
    	DocumentManager     = brackets.getModule("document/DocumentManager"),
        JSUtils             = brackets.getModule("language/JSUtils"),
		PerfUtils           = brackets.getModule("utils/PerfUtils"),
		ProjectManager      = brackets.getModule("project/ProjectManager"),
		LanguageManager     = brackets.getModule("language/LanguageManager"),
		CommandManager		= brackets.getModule("command/CommandManager"),
		Commands			= brackets.getModule("command/Commands");


   /**
    * Find function in a project and return the first found function with a specific name
    * Using {@link _findFunctionWithoutTern} if tern doesn't work
    * @param   {String}   functionName name of the function
    * @returns {Deferred} Object which includes the path and the lines of the function
    */
   function findFunctionInProject(functionName) {
        var result = new $.Deferred();

		// Use Tern jump-to-definition helper, if it's available, to find InlineEditor target.
        var helper = brackets._jsCodeHintsHelper;
        if (helper === null) {
            result.reject();
        }

	    var response = helper();
        if (response.hasOwnProperty("promise")) {
            response.promise.done(function (jumpResp) {
                var resolvedPath = jumpResp.fullPath;
                if (resolvedPath) {
                    // Tern doesn't always return entire function extent.
                    // Use QuickEdit search now that we know which file to look at.
                    var fileInfos = [];
                    fileInfos.push({name: jumpResp.resultFile, fullPath: resolvedPath});
                    JSUtils.findMatchingFunctions(functionName, fileInfos, true)
                        .done(function (functions) {
                            if (functions && functions.length > 0) {
                               result.resolve(functions[0]);
                            } else {
                                console.log('no function found with tern');
								// try without tern
								_findFunctionWithoutTern(functionName).done(function (functions) {
									if (functions && functions.length > 0) {
									   result.resolve(functions[0]);
									} else {
										console.log('no function found');
										result.reject();
									}
								}).fail(function () {
									result.reject();
								});
							}
                        })
                        .fail(function () {
                            result.reject();
                        });

                } else {        // no result from Tern.
                    _findFunctionWithoutTern(functionName).done(function (functions) {
                        if (functions && functions.length > 0) {
                           result.resolve(functions[0]);
                        } else {
                           	console.log('no function found');
                            result.reject();
                        }
                    }).fail(function () {
                        result.reject();
                    });
                }

            }).fail(function () {
                result.reject();
            });
		}

        return result.promise();
    }


	/*
	 * Find a function without using tern
     * @param {!string} functionName
     * @return {$.Promise} a promise that will be resolved with an array of function offset information
     */
    function  _findFunctionWithoutTern(functionName) {
        var result = new $.Deferred();

        var timerName = PerfUtils.markStart(PerfUtils.JAVASCRIPT_FIND_FUNCTION);

        function _nonBinaryFileFilter(file) {
            return !LanguageManager.getLanguageForPath(file.fullPath).isBinary();
        }

        ProjectManager.getAllFiles(_nonBinaryFileFilter)
            .done(function (files) {
                JSUtils.findMatchingFunctions(functionName, files)
                    .done(function (functions) {
                        PerfUtils.addMeasurement(timerName);
                        result.resolve(functions);
                    })
                    .fail(function () {
                        PerfUtils.finalizeMeasurement(timerName);
                        result.reject();
                    });
            })
            .fail(function () {
                result.reject();
            });

        return result.promise();
    }
    /**
     * Jump to a given function
     * @param {String} functionName
     */
    function itemFocus(functionName) {
        if (!functionName) {
            return;
        }

		findFunctionInProject(functionName).done(function(func) {
			if (DocumentManager.getCurrentDocument().file._path != func.document.file._path) {
				CommandManager.execute( Commands.FILE_OPEN, { fullPath: func.document.file._path } ).done( function() {
					setCursorPos(func.lineStart,0,true);
				});
			} else {
				setCursorPos(func.lineStart,0,true);
			}
		});
    }

	/**
	 * Set the curor position in the current file
	 * @param {Number}  line   line number
	 * @param {Number}  ch     Column/Char number
	 * @param {Boolean} center true for center the cursor position
	 */
	function setCursorPos(line,ch,center) {
		// Set focus on editor.
		EditorManager.focusEditor();
		EditorManager.getCurrentFullEditor().setCursorPos(
			line,
			ch,
			center );
	}


	exports.findFunctionInProject 	= findFunctionInProject;
	exports.itemFocus 				= itemFocus;
});
