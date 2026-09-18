(function( ab ){
	"use strict";

	ab.eventTarget = function(){
		var listeners = [],
			
			addEventListener = function(eventType, callback){
			    if(!listeners[eventType]){
					listeners[eventType] = [];
				}
				listeners[eventType].push(callback);
			},

			dispatchEvent = function(event){
				if(!listeners[event.type]){
					return;
				}
				listeners[event.type].forEach(function(callback){
					callback(event);
				});

			},

			removeEventListener = function(eventType, callback){
				if(!listeners[eventType]){
					return;
				}
				for(var i = 0, ll = listners.length; i < ll; i++){
					if(listners[i] === callback){
						listeners.splice(index, 1);
						break;
					} 
				}
			}

		return{
			addEventListener: addEventListener,
			dispatchEvent: dispatchEvent,
			removeEventListener: removeEventListener
		}
	}

}(window.ab = window.ab || {}));