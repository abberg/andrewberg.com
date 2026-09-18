(function (window) {
  var transitions = {
    'MozTransition': 'transitionend',
    'WebkitTransition': 'webkitTransitionEnd',
    'transition': 'transitionEnd',
    'MSTransition': 'msTransitionEnd',
    'OTransition': 'oTransitionEnd'
  },
  elem = window.document.createElement('div');
 
  for(var t in transitions){
    if(elem.style[t] !== undefined){
      window.transitionEnd = transitions[t];
      break;
    }
  }
})(window);