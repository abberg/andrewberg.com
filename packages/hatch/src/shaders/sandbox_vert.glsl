varying vec3 vLightFront;

uniform vec3 ambient;
uniform vec3 diffuse;
uniform vec3 emissive;

uniform vec3 ambientLightColor;

uniform vec3 spotLightColor[ MAX_SPOT_LIGHTS ];
uniform vec3 spotLightPosition[ MAX_SPOT_LIGHTS ];
uniform vec3 spotLightDirection[ MAX_SPOT_LIGHTS ];
uniform float spotLightDistance[ MAX_SPOT_LIGHTS ];
uniform float spotLightAngle[ MAX_SPOT_LIGHTS ];
uniform float spotLightExponent[ MAX_SPOT_LIGHTS ];

uniform float morphTargetInfluences[ 4 ];

varying vec4 vShadowCoord[ MAX_SHADOWS ];
uniform mat4 shadowMatrix[ MAX_SHADOWS ];

/****************************************************************************
* MeshLab                                                           o o     *
* An extendible mesh processor                                    o     o   *
*                                                                _   O  _   *
* Copyright(C) 2005, 2009                                          \/)\/    *
* Visual Computing Lab                                            /\/|      *
* ISTI - Italian National Research Council                           |      *
*                                                                    \      *
* All rights reserved.                                                      *
*                                                                           *
* This program is free software; you can redistribute it and/or modify      *
* it under the terms of the GNU General Public License as published by      *
* the Free Software Foundation; either version 2 of the License, or         *
* (at your option) any later version.                                       *
*                                                                           *
* This program is distributed in the hope that it will be useful,           *
* but WITHOUT ANY WARRANTY; without even the implied warranty of            *
* MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the             *
* GNU General Public License (http://www.gnu.org/licenses/gpl.txt)          *
* for more details.                                                         *
*                                                                           *
****************************************************************************/

uniform vec3  HatchDirection;
uniform float Lightness;

varying vec3  ObjPos;
varying float V;
varying float LightIntensity;

/*
void main()
{
    ObjPos          = vec3(gl_Vertex) * 0.2;

    vec3 pos        = vec3(gl_ModelViewMatrix * gl_Vertex);
    vec3 tnorm      = normalize(gl_NormalMatrix * gl_Normal);
    //vec3 lightVec   = normalize(LightPosition - pos);
	vec3 lightVec =  vec3(gl_LightSource[0].position);

    float grey = Lightness*dot (vec4(.333,.333,.333,0),gl_Color);
	LightIntensity  = max(grey * dot(lightVec, tnorm), 0.0);
	//LightIntensity  = max(dot(lightVec, tnorm), 0.0);
    
    //V = gl_MultiTexCoord0.t;  // try .s for vertical stripes
	V =dot(vec3(gl_Vertex),HatchDirection);

    gl_Position = ftransform();
//    gl_FrontColor=gl_Color;
}
*/

void main(){

	ObjPos = vec3(position) * 0.2;
	V = dot(vec3(position),HatchDirection);

	vec4 mvPosition = modelViewMatrix * vec4( position, 1.0 );

	vec3 morphedNormal = vec3( 0.0 );

	morphedNormal +=  ( morphNormal0 - normal ) * morphTargetInfluences[ 0 ];
	morphedNormal +=  ( morphNormal1 - normal ) * morphTargetInfluences[ 1 ];
	morphedNormal +=  ( morphNormal2 - normal ) * morphTargetInfluences[ 2 ];
	morphedNormal +=  ( morphNormal3 - normal ) * morphTargetInfluences[ 3 ];

	morphedNormal += normal;

	vec3 transformedNormal = normalMatrix * morphedNormal;

	vec4 mPosition = objectMatrix * vec4( position, 1.0 );

	vLightFront = vec3( 0.0 );

	transformedNormal = normalize( transformedNormal );


	for( int i = 0; i < MAX_SPOT_LIGHTS; i ++ ) {

		vec4 lPosition = viewMatrix * vec4( spotLightPosition[ i ], 1.0 );
		vec3 lVector = lPosition.xyz - mvPosition.xyz;

		lVector = normalize( lVector );

		float spotEffect = dot( spotLightDirection[ i ], normalize( spotLightPosition[ i ] - mPosition.xyz ) );

		if ( spotEffect > spotLightAngle[ i ] ) {

			spotEffect = pow( spotEffect, spotLightExponent[ i ] );

			float lDistance = 1.0;
			if ( spotLightDistance[ i ] > 0.0 )
				lDistance = 1.0 - min( ( length( lVector ) / spotLightDistance[ i ] ), 1.0 );

			float dotProduct = dot( transformedNormal, lVector );
			vec3 spotLightWeighting = vec3( max( dotProduct, 0.0 ) );
			LightIntensity += max(Lightness * dotProduct, 0.0);
			vLightFront += spotLightColor[ i ] * spotLightWeighting * lDistance * spotEffect;

		}

	}

	vLightFront = vLightFront * diffuse + ambient * ambientLightColor + emissive;

	vec3 morphed = vec3( 0.0 );
	morphed += ( morphTarget0 - position ) * morphTargetInfluences[ 0 ];
	morphed += ( morphTarget1 - position ) * morphTargetInfluences[ 1 ];
	morphed += ( morphTarget2 - position ) * morphTargetInfluences[ 2 ];
	morphed += ( morphTarget3 - position ) * morphTargetInfluences[ 3 ];

	morphed += position;

	gl_Position = projectionMatrix * modelViewMatrix * vec4( morphed, 1.0 );


	for( int i = 0; i < MAX_SHADOWS; i ++ ) {

			vShadowCoord[ i ] = shadowMatrix[ i ] * objectMatrix * vec4( morphed, 1.0 );

	}


}