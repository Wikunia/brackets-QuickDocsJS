/*
 * Copyright (c) 2013 Adobe Systems Incorporated. All rights reserved.
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


/*jslint vars: true, plusplus: true, devel: true, nomen: true, indent: 4, maxerr: 50 */
/*global define, brackets, $, window, Mustache */

/**
 * Inline widget to display WebPlatformDocs JSON data nicely formatted
 */
define(function (require, exports, module) {
    'use strict';
    
    // Load Brackets modules
    var ExtensionUtils      = brackets.getModule("utils/ExtensionUtils"),
        InlineWidget        = brackets.getModule("editor/InlineWidget").InlineWidget,
        KeyEvent            = brackets.getModule("utils/KeyEvent"),
        NativeApp           = brackets.getModule("utils/NativeApp"),
        Strings             = brackets.getModule("strings"),
		QuickOpenJS			= require('QuickOpenJS');

    
	var infoUrl,infoUrlName,licenseUrl,licenseUrlName;

    // Load template
    var inlineEditorTemplate = require("text!InlineDocsViewer.html");
    
    // Lines height for scrolling
    var SCROLL_LINE_HEIGHT = 40;
    
    // Load CSS
    ExtensionUtils.loadStyleSheet(module, "WebPlatformDocsJS.less");
    
    
    /**
     * @param {!string} jsPropName
     * @param {!{SUMMARY:string, SYNTAX:string, RETURN:string, URL:string, VALUES:Array.<{TITLE:string, DESCRIPTION:string}>}} jsPropDetails
     */
    function InlineDocsViewer(jsPropName, jsPropDetails) {
        InlineWidget.call(this);
        
        // valueInfo.t = title (.d = description)
        var propValues = jsPropDetails.VALUES.map(function (valueInfo) {
			valueInfo.cssOptionalDefault = 'display:none;';
			if (valueInfo.optional) {
				if (valueInfo.default !== null && typeof valueInfo.default !== "undefined") {
					valueInfo.default = 'Default: '+valueInfo.default;
					valueInfo.cssOptionalDefault = 'display:inline;';
				}
				valueInfo.cssOptional = 'display:inline;';
			} else {
				valueInfo.cssOptional = 'display:none;';
			}
			var propsForProps = false;
			if ("pa" in valueInfo) {
				propsForProps = valueInfo.pa.map(function (propsForValue) {
					propsForValue.cssOptionalDefault = 'display:none;';
					if (propsForValue.optional) {
						if (propsForValue.default !== null && typeof propsForValue.default !== "undefined") {
							propsForValue.default = 'Default: '+propsForValue.default;
							propsForValue.cssOptionalDefault = 'display:inline;';
						}
						propsForValue.cssOptional = 'display:inline;';
					} else {
						propsForValue.cssOptional = 'display:none;';
					}

					return {
						name: 					propsForValue.t,
						description: 			parseJSDocs(propsForValue.d),
						type: 					propsForValue.type,
						default: 				propsForValue.default,
						cssOptional: 			propsForValue.cssOptional,
						cssOptionalDefault: 	propsForValue.cssOptionalDefault
					};
				});
			}
				
            return {
				name: 					valueInfo.t,
				description: 			parseJSDocs(valueInfo.d),
				propsForProps:			propsForProps,
				type: 					valueInfo.type,
				default: 				valueInfo.default,
				cssOptional: 			valueInfo.cssOptional,
				cssOptionalDefault: 	valueInfo.cssOptionalDefault
			};
        });
		
		var returnValues = [{description: parseJSDocs(jsPropDetails.RETURN.d), type: jsPropDetails.RETURN.type}];

        
        var bottom_style = '', syntax_style = '', return_style = '';
        
        if (!jsPropDetails.URL) {
            bottom_style = 'display: none;';
        }
        if (!jsPropDetails.SYNTAX) {
            syntax_style = 'display: none;';
        }

        if (!returnValues[0].description && !returnValues[0].type) {
            return_style = 'display: none;';
        }
       
		window.addEventListener
		if (jsPropDetails.URL && jsPropDetails.URL.indexOf("http://nodejs.org") === 0) {
			infoUrl 		= "http://nodejs.org";
			infoUrlName 	= "NodeJS.org";
			licenseUrl		= "https://raw.githubusercontent.com/joyent/node/v0.10.32/LICENSE";
			licenseUrlName	= "NodeJS License";
		} else if (jsPropDetails.URL && jsPropDetails.URL.indexOf("http://api.jquery.com") === 0) {
			infoUrl 		= "https://api.jquery.com/";
			infoUrlName 	= "jquery.com"
			licenseUrl		= "http://en.wikipedia.org/wiki/MIT_License";
			licenseUrlName	= "MIT License";
		} else if (jsPropDetails.URL && jsPropDetails.URL.indexOf("http://facebook.github.io") === 0) {
			infoUrl 		= "http://facebook.github.io/react/";
			infoUrlName 	= "ReactJS";
			licenseUrl		= "https://raw.githubusercontent.com/facebook/react/master/LICENSE";
			licenseUrlName	= "BSD License";
		} else {
			infoUrl 		= "https://developer.mozilla.org/";
			infoUrlName 	= "mozilla.org"
			licenseUrl		= "https://developer.mozilla.org/en-US/docs/MDN/About#Copyrights_and_licenses";
			licenseUrlName	= "Creative Commons License";
		}
        

        var templateVars = {
            propName      : jsPropName,
            summary       : parseJSDocs(jsPropDetails.SUMMARY),
            syntax        : jsPropDetails.SYNTAX,
            returnValues  : returnValues,
            propValues    : propValues,
            url           : jsPropDetails.URL,
            BottomStyle   : bottom_style,
            SyntaxStyle   : syntax_style,
            ReturnStyle   : return_style,
            Strings       : Strings,
			infoUrl		  : infoUrl,
			infoUrlName   : infoUrlName,
			licenseUrl    : licenseUrl,
			licenseUrlName: licenseUrlName
        };
        
        var html = Mustache.render(inlineEditorTemplate, templateVars);	
        this.$wrapperDiv = $(html);
        this.$htmlContent.append(this.$wrapperDiv);
        
        // Preprocess link tags to make URLs absolute
        this.$wrapperDiv.find("a").each(function (index, elem) {
            var $elem = $(elem);
            var url = $elem.attr("href");
            if (url && url.substr(0, 4) !== "http" && !$elem.hasClass('jumpToDef')) {
                // URLs in JSON data are relative
                url = "https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/" + url;
                $elem.attr("href", url);
            } else if (url) {
				// URLs in JSON data are relative
                $elem.attr("href", url);
			}
            $elem.attr("title", url);
        });
        
        this._sizeEditorToContent   = this._sizeEditorToContent.bind(this);
        this._handleWheelScroll     = this._handleWheelScroll.bind(this);

        this.$scroller = this.$wrapperDiv.find(".scroller");
        this.$scroller.on("mousewheel", this._handleWheelScroll);
        this._onKeydown = this._onKeydown.bind(this);

		this.$jumpToDef = this.$wrapperDiv.find(".jumpToDef");
		this.$jumpToDef.on('click', function(event) {
			event.preventDefault();
			var linkFunc = $(this).attr("href").substr(1);
			QuickOpenJS.itemFocus(linkFunc);
		});
    }
    
    InlineDocsViewer.prototype = Object.create(InlineWidget.prototype);
    InlineDocsViewer.prototype.constructor = InlineDocsViewer;
    InlineDocsViewer.prototype.parentClass = InlineWidget.prototype;
    
    InlineDocsViewer.prototype.$wrapperDiv = null;
    InlineDocsViewer.prototype.$scroller = null;
    
    /**
     * Handle scrolling.
     *
     * @param {Event} event Keyboard event or mouse scrollwheel event
     * @param {boolean} scrollingUp Is event to scroll up?
     * @param {DOMElement} scroller Element to scroll
     * @return {boolean} indication whether key was handled
     */
    InlineDocsViewer.prototype._handleScrolling = function (event, scrollingUp, scroller) {
        // We need to block the event from both the host CodeMirror code (by stopping bubbling) and the
        // browser's native behavior (by preventing default). We preventDefault() *only* when the docs
        // scroller is at its limit (when an ancestor would get scrolled instead); otherwise we'd block
        // normal scrolling of the docs themselves.
        event.stopPropagation();
        if (scrollingUp && scroller.scrollTop === 0) {
            event.preventDefault();
            return true;
        } else if (!scrollingUp && scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight) {
            event.preventDefault();
            return true;
        }
        
        return false;
    };
    
    /** Don't allow scrollwheel/trackpad to bubble up to host editor - makes scrolling docs painful */
    InlineDocsViewer.prototype._handleWheelScroll = function (event) {
        var scrollingUp = (event.originalEvent.wheelDeltaY > 0),
            scroller = event.currentTarget;
        
        // If content has no scrollbar, let host editor scroll normally
        if (scroller.clientHeight >= scroller.scrollHeight) {
            return;
        }
        
        this._handleScrolling(event, scrollingUp, scroller);
    };
    
    
    /**
     * Convert keydown events into navigation actions.
     *
     * @param {KeyboardEvent} event
     * @return {boolean} indication whether key was handled
     */
    InlineDocsViewer.prototype._onKeydown = function (event) {
        var keyCode  = event.keyCode,
            scroller = this.$scroller[0],
            scrollPos;

        // Ignore key events with modifier keys
        if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) {
            return false;
        }

        // Handle keys that we're interested in
        scrollPos = scroller.scrollTop;

        switch (keyCode) {
        case KeyEvent.DOM_VK_UP:
            scrollPos = Math.max(0, scrollPos - SCROLL_LINE_HEIGHT);
            break;
        case KeyEvent.DOM_VK_PAGE_UP:
            scrollPos = Math.max(0, scrollPos - scroller.clientHeight);
            break;
        case KeyEvent.DOM_VK_DOWN:
            scrollPos = Math.min(scroller.scrollHeight - scroller.clientHeight,
                                 scrollPos + SCROLL_LINE_HEIGHT);
            break;
        case KeyEvent.DOM_VK_PAGE_DOWN:
            scrollPos = Math.min(scroller.scrollHeight - scroller.clientHeight,
                                 scrollPos + scroller.clientHeight);
            break;
        default:
            // Ignore other keys
            return false;
        }

        scroller.scrollTop = scrollPos;

        // Disallow further processing
        event.stopPropagation();
        event.preventDefault();
        return true;
    };
    
    InlineDocsViewer.prototype.onAdded = function () {
        InlineDocsViewer.prototype.parentClass.onAdded.apply(this, arguments);
        
        // Set height initially, and again whenever width might have changed (word wrap)
        this._sizeEditorToContent();
        $(window).on("resize", this._sizeEditorToContent);

        // Set focus
        this.$scroller[0].focus();
        this.$wrapperDiv[0].addEventListener("keydown", this._onKeydown, true);
    };
    
    InlineDocsViewer.prototype.onClosed = function () {
        InlineDocsViewer.prototype.parentClass.onClosed.apply(this, arguments);
        
        $(window).off("resize", this._sizeEditorToContent);
        this.$wrapperDiv[0].removeEventListener("keydown", this._onKeydown, true);
    };
    
    InlineDocsViewer.prototype._sizeEditorToContent = function () {
        this.hostEditor.setInlineWidgetHeight(this, this.$wrapperDiv.height() + 20, true);
    };
    

	/**
	 * {@link get_userdefined_tags}
	 * @param   {String} doc [[Description]]
	 * @returns {String} [[Description]]
	 */
	function parseJSDocs(doc) {
		if (typeof doc == "string") {
			doc = doc.replace(/<br \/>|<br>/,'\r\n');
			doc = doc.replace(/{@link\s+([^|}]*?)\|\s*(.*?)}/m,function(match,p1,p2) {
				if (/^https?:\/\//.test(p1.trim())) {
					return '<a href="'+p1.trim()+'">'+p2.trim()+'</a>';
				}
				return '<a class="jumpToDef" href="#'+p1.trim()+'">'+p2.trim()+'</a>';
			});
			doc = doc.replace(/(?:\[(.*?)\])?{@link\s+([^| ]*?)(?:\s+(.*?))?}/m,function(match,p1,p2,p3) {
				if (p1) {
					if (/^https?:\/\//.test(p1.trim())) {
						return '<a href="'+p2.trim()+'">'+p1.trim()+'</a>';
					}
					return '<a class="jumpToDef" href="#'+p2.trim()+'">'+p1.trim()+'</a>';
				}
				if (p3) {
					if (/^https?:\/\//.test(p2.trim())) {
						return '<a href="'+p2.trim()+'">'+p3.trim()+'</a>';
					}
					return '<a class="jumpToDef" href="#'+p2.trim()+'">'+p3.trim()+'</a>';
				}
				if (/^https?:\/\//.test(p2.trim())) {
					return '<a href="'+p2.trim()+'">'+p2.trim()+'</a>';
				}
				return '<a class="jumpToDef" href="#'+p2.trim()+'">'+p2.trim()+'</a>';

			});
			doc = doc.replace(/\r\n/,'<br />');
		}
		return doc;
	}


    
    module.exports = InlineDocsViewer;
});
