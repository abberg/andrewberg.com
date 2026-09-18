(function( ab, eventTarget ){
	"use strict";

	ab.threeBase = function(config){
		
		config = config || {};

		var aspectRatio = config.aspectRation || 2.58,
			
			scene = (function(){
				var scn = new THREE.Scene();
				return function(){
					return scn;
				}
			}()),

			camera = (function(){
				var cam = new THREE.PerspectiveCamera( 45, aspectRatio, 1, 1000 );
				return function(){
					return cam;
				}
			}()),
			
			renderer = (function(){
				var rnd = new THREE.WebGLRenderer({
					canvas: config.canvas,
					precision: config.precision,
					alpha: config.alpha,
					premultipliedAlpha: config.premultipliedAlpha,
					antialias: config.antialias,
					stencil: config.stencil,
					preserveDrawingBuffer: config.preserveDrawingBuffer,
					maxLights: config.maxLights
				});
				return function(){
					return rnd;
				}
			}()),

			init = function(){
				document.body.appendChild( renderer().domElement );
				window.addEventListener('resize', onResize);
				onResize();
			},

			onResize = function(){
				var width,
					height;

				if(window.innerWidth > 800){
					width = window.innerWidth,
					height = window.innerWidth / aspectRatio;
				}else{
					width = window.innerWidth,
					height = window.innerHeight;
				}

				renderer().setSize( width, height );
				camera().aspect = width / height;
				camera().updateProjectionMatrix();
			};

		init();

		return {
			scene: scene,
			camera: camera,
			renderer: renderer
		};
	
	}

}(window.ab = window.ab || {}, ab.eventTarget));