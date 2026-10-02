vecUtils = {
	name: "vecUtils",
	// methods
	interpolate: function (alpha, x0, x1){
		return x0 + ((x1 - x0) * alpha);
    },

    // return component of vector parallel to a unit basis vector
    // (IMPORTANT NOTE: assumes "basis" has unit magnitude (length==1))
	parallelComponent:function (vector3, unitBasis){
		var that = this.parallelComponent,
			projection;

		if(that.result === undefined){
			that.result = vec3.create();
		}

		projection = vec3.dot(vector3, unitBasis);
		vec3.scale(unitBasis, projection, that.result);

		return that.result;
	},

    // return component of vector perpendicular to a unit basis vector
    // (IMPORTANT NOTE: assumes "basis" has unit magnitude (length==1))
	perpendicularComponent:function(vector3, unitBasis){
		var that = this.perpendicularComponent;
		if(that.result === undefined){
			that.result = vec3.create();
		}
		vec3.subtract(vector3, this.parallelComponent(vector3, unitBasis), that.result);
		return that.result;
	},
    // ----------------------------------------------------------------------------
	// Does a "ceiling" or "floor" operation on the angle by which a given vector
	// deviates from a given reference basis vector.  Consider a cone with "basis"
	// as its axis and slope of "cosineOfConeAngle".  The first argument controls
	// whether the "source" vector is forced to remain inside or outside of this
	// cone.  Called by vecLimitMaxDeviationAngle and vecLimitMinDeviationAngle.
	
	vecLimitDeviationAngleUtility:function (insideOrOutside, source, cosineOfConeAngle, basis){

		var that = this.vecLimitDeviationAngleUtility,
			sourceLength,
			cosineOfSourceAngle,
			perp;

		// cache vectors for calcualtion...
		if(that.direction === undefined){
			that.direction	= vec3.create();
			that.unitPerp	= vec3.create();
			that.c0			= vec3.create();
			that.c1			= vec3.create();
		}

		// immediately return zero length input vectors
		sourceLength = vec3.length(source);
		if (sourceLength === 0){
			return source;
		}
		// measure the angular diviation of "source" from "basis"
		vec3.set(source[0]/sourceLength, source[1]/sourceLength, source[2]/sourceLength, that.direction);
		cosineOfSourceAngle = vec3.dot(that.direction, basis);

		// Simply return "source" if it already meets the angle criteria.
		// (note: we hope this top "if" gets compiled out since the flag
		// is a constant when the function is inlined into its caller)
		if (insideOrOutside){
			// source vector is already inside the cone, just return it
			if (cosineOfSourceAngle >= cosineOfConeAngle){
				return source;
			}
		}else{
		// source vector is already outside the cone, just return it
			if (cosineOfSourceAngle <= cosineOfConeAngle){
				return source;
			}
		}

		// find the portion of "source" that is perpendicular to "basis"
		perp = this.perpendicularComponent(source, basis);

		// normalize that perpendicular
		vec3.normalize(perp, that.unitPerp);

		// construct a new vector whose length equals the source vector,
		// and lies on the intersection of a plane (formed the source and
		// basis vectors) and a cone (whose axis is "basis" and whose
		// angle corresponds to cosineOfConeAngle)
		var perpDist = Math.sqrt(1 - (cosineOfConeAngle * cosineOfConeAngle));
		vec3.scale(basis, cosineOfConeAngle, that.c0);
		vec3.scale(that.unitPerp, perpDist, that.c1);
		vec3.add(that.c0, that.c1);
		vec3.scale(that.c0, sourceLength);
		vec3.set(that.c0, source);
		return source;
	},

	limitMaxDeviationAngle:function (source, cosineOfConeAngle, basis){
		return this.vecLimitDeviationAngleUtility (true, source, cosineOfConeAngle, basis);
    }
};