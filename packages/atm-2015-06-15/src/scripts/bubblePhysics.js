(function(ab){
    "use strict";
    // Gentle, radius-aware sphere contacts. Velocities are world units per second.
    ab.separateBubbles = function(bubbles){
        for (var pass = 0; pass < 3; pass++) {
            for (var i = 0; i < bubbles.length; i++) {
                var a = bubbles[i], ap = a.model.position;
                for (var j = i + 1; j < bubbles.length; j++) {
                    var b = bubbles[j], bp = b.model.position;
                    var radius = a.radius + b.radius;
                    var dx = bp.x - ap.x, dy = bp.y - ap.y, dz = bp.z - ap.z;
                    var squared = dx * dx + dy * dy + dz * dz;
                    if (squared >= radius * radius) continue;
                    var distance = Math.sqrt(squared);
                    var nx = distance > 0.000001 ? dx / distance : 1;
                    var ny = distance > 0.000001 ? dy / distance : 0;
                    var nz = distance > 0.000001 ? dz / distance : 0;
                    var weight = a.inverseMass + b.inverseMass;
                    // Correct overlap separately from velocity so crowded starts don't explode.
                    var correction = Math.max(0, radius - distance - 0.002) * 0.7 / weight;
                    ap.x -= nx * correction * a.inverseMass;
                    ap.y -= ny * correction * a.inverseMass;
                    ap.z -= nz * correction * a.inverseMass;
                    bp.x += nx * correction * b.inverseMass;
                    bp.y += ny * correction * b.inverseMass;
                    bp.z += nz * correction * b.inverseMass;
                    var approach = (b.velocity.x - a.velocity.x) * nx +
                        (b.velocity.y - a.velocity.y) * ny + (b.velocity.z - a.velocity.z) * nz;
                    if (approach >= 0) continue;
                    var impulse = -1.15 * approach / weight;
                    a.velocity.x -= nx * impulse * a.inverseMass;
                    a.velocity.y -= ny * impulse * a.inverseMass;
                    a.velocity.z -= nz * impulse * a.inverseMass;
                    b.velocity.x += nx * impulse * b.inverseMass;
                    b.velocity.y += ny * impulse * b.inverseMass;
                    b.velocity.z += nz * impulse * b.inverseMass;
                }
            }
        }
    };
}(window.ab = window.ab || {}));
