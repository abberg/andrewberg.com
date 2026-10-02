var signal = {
	slots:{
		writable: true,
		enumerable: true
	},
	connect: {
		value: function(){
			this.slots.push(arguments);
		},
		enumerable: true
	},
	emit: {
		value: function(){
			var slotsLength = this.slots.length,
				i;
			for(i = 0; i < slotsLength; i++){
				this.slots[i][0].apply(this.slots[i][1], arguments);
			}
		},
		enumerable: true
	}
};

var createSignal = function(){
	var sig = Object.create(null, signal);
	sig.slots = [];
	return sig;
};