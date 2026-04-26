/**
 * Pixel Pet v2 - Physics Engine & Mouse interaction
 */

class PhysicsObject {
    constructor(el, x, y) {
        this.el = el;
        this.x = x;
        this.y = y;
        this.vx = 0;
        this.vy = 0;
        this.width = el.offsetWidth || 32;
        this.height = el.offsetHeight || 32;
        this.gravity = 0.6;
        this.friction = 0.98;
        this.bounce = 0.5;
        this.isGrounded = false;
        this.isHangingSubtitle = false;
        this.hangSubtitleTimer = 0;
        this.hangSwingPhase = 0;
    }

    update() {
        // If hanging from subtitle, skip normal physics
        if (this.isHangingSubtitle) {
            this.updateSubtitleHang();
            this.applyPosition();
            return;
        }

        // If riding the ball, only do ball ride logic
        if (this.isRidingBall) {
            this.checkBallCollision();
            this.applyPosition();
            return;
        }

        // Apply mobile tilt force
        if (this._tiltForce) {
            this.vx += this._tiltForce;
        }

        this.vy += this.gravity;
        this.vx *= this.friction;

        this.x += this.vx;
        this.y += this.vy;

        this.checkCollisions();
        this.checkSubtitleCollision();
        this.checkBallCollision();
        this.applyPosition();
    }

    checkBallCollision() {
        const ball = window.__cursorBall;

        // If riding the ball and mouse came back (ball stopped falling) → dismount
        if (this.isRidingBall && (!ball || !ball.isFalling)) {
            this.isRidingBall = false;
            this.isChasingBall = false;
            this.ballTrickState = null;
            this.vy = -6; // Small hop off
            this.vx = (Math.random() - 0.5) * 4;
            this.isGrounded = false;
            return;
        }

        if (!ball || !ball.isFalling) {
            this.isChasingBall = false;
            this.isRidingBall = false;
            this.ballTrickState = null;
            return;
        }

        // If already riding, stay on the ball
        if (this.isRidingBall) {
            this.updateBallRide(ball);
            return;
        }

        // Ball position is in viewport coords; convert pet to viewport
        const petScreenX = this.x - window.scrollX;
        const petScreenY = this.y - window.scrollY;
        const petCenterX = petScreenX + this.width / 2;
        const petCenterY = petScreenY + this.height / 2;

        const dx = ball.x - petCenterX;
        const dy = ball.y - petCenterY;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const mountDist = ball.radius + this.height;

        // Close enough to mount the ball → hop on top
        if (dist < mountDist && this.isGrounded) {
            this.isRidingBall = true;
            this.isChasingBall = false;
            this.ballTrickTimer = 0;
            this.ballTrickState = 'balance';
            this.ballTrickPhase = 0;
            this.ballFacingDir = Math.random() > 0.5 ? 1 : -1;
            this.vy = 0;
            this.vx = 0;
            return;
        }

        // Chase behavior: run towards the ball (don't jump, just run!)
        if (this.isGrounded) {
            this.isChasingBall = true;
            const chaseSpeed = 2.0;
            if (Math.abs(dx) > 5) {
                this.vx += (dx > 0 ? chaseSpeed : -chaseSpeed) * 0.15;
            }
        }
    }

    updateBallRide(ball) {
        this.ballTrickTimer++;
        this.ballTrickPhase += 0.05;

        // Position bear on top of the ball
        const ballScreenX = ball.x;
        const ballScreenY = ball.y;

        // Bear sits on top of ball (ball radius above ball center)
        this.x = ballScreenX - this.width / 2 + window.scrollX;
        this.y = ballScreenY - ball.radius - this.height + window.scrollY;

        // Add slight sway for balance effect
        const sway = Math.sin(this.ballTrickPhase * 2) * 2;
        this.x += sway;

        // Switch to a random trick every ~2 seconds
        const trickCycleDuration = 120; // frames
        if (this.ballTrickTimer % trickCycleDuration === 0) {
            const tricks = ['balance', 'wave', 'spin', 'kick'];
            this.ballTrickState = tricks[Math.floor(Math.random() * tricks.length)];
            // Randomly flip facing direction on trick change
            if (Math.random() > 0.5) this.ballFacingDir *= -1;
        }

        // Kick: dismount and boot the ball away!
        if (this.ballTrickState === 'kick' && this.ballTrickTimer % trickCycleDuration === 0) {
            this.isRidingBall = false;
            this.ballTrickState = null;
            // Bear hops slightly
            this.vy = -4;
            this.isGrounded = false;
            // Kick the ball in a random direction
            const kickDir = Math.random() > 0.5 ? 1 : -1;
            ball.applyImpulse(kickDir * 8, -6);
            return;
        }

        // Freeze physics while riding
        this.vx = 0;
        this.vy = 0;
        this.isGrounded = false;

        // Slightly dampen ball velocity to show bear's weight
        ball.applyImpulse(0, -0.05);
    }

    checkSubtitleCollision() {
        if (this.isGrounded || this.isHangingSubtitle || this.vy > 0) return;

        const subtitle = document.querySelector('.hero__role');
        if (!subtitle) return;

        const rect = subtitle.getBoundingClientRect();
        const subTop = rect.top + window.scrollY;
        const subBottom = subTop + rect.height;
        const subLeft = rect.left + window.scrollX;
        const subRight = subLeft + rect.width;

        const petCenterX = this.x + this.width / 2;
        const petTop = this.y;

        // Check if pet's top is near the subtitle bottom (reaching up to grab)
        if (petTop <= subBottom + 4 && petTop >= subTop - 8 &&
            petCenterX > subLeft - 10 && petCenterX < subRight + 10) {
            this.isHangingSubtitle = true;
            this.hangSubtitleTimer = 0;
            this.hangSwingPhase = 0;
            this.vx = 0;
            this.vy = 0;
            // Snap to the subtitle bottom
            this.y = subBottom - 4;
            // Clamp X within subtitle bounds
            this.hangAnchorX = Math.max(subLeft + 8, Math.min(subRight - 8, petCenterX)) - this.width / 2;
            this.x = this.hangAnchorX;
        }
    }

    updateSubtitleHang() {
        this.hangSubtitleTimer++;
        this.hangSwingPhase += 0.06;

        // Gentle swinging motion
        const swingAmplitude = 3 * Math.max(0, 1 - this.hangSubtitleTimer / 180);
        this.x = this.hangAnchorX + Math.sin(this.hangSwingPhase) * swingAmplitude;

        // Slight vertical bob
        const bob = Math.sin(this.hangSwingPhase * 2) * 1;

        const subtitle = document.querySelector('.hero__role');
        if (subtitle) {
            const rect = subtitle.getBoundingClientRect();
            const subBottom = rect.top + window.scrollY + rect.height;
            this.y = subBottom - 4 + bob;
        }

        // After ~3 seconds (180 frames at 60fps), let go
        if (this.hangSubtitleTimer > 180) {
            this.isHangingSubtitle = false;
            this.vy = 1; // Gentle drop
            this.vx = (Math.random() - 0.5) * 3;
        }
    }

    checkCollisions() {
        this.isGrounded = false;
        this.isHanging = false;
        
        const docWidth = document.documentElement.clientWidth;
        if (this.x < 0) {
            this.x = 0;
            this.vx *= -this.bounce;
        } else if (this.x + this.width > docWidth) {
            this.x = docWidth - this.width;
            this.vx *= -this.bounce;
        }

        const cards = Array.from(document.querySelectorAll('.card, .stat-item, .tech-chip, .featured-project'));
        const borderRadius = 24; 
        
        for (let card of cards) {
            const rect = card.getBoundingClientRect();
            const cardTop = rect.top + window.scrollY;
            const cardLeft = rect.left + window.scrollX;
            const cardRight = cardLeft + rect.width;

            if (this.x + this.width > cardLeft && this.x < cardRight) {
                let effectiveTop = cardTop;
                const petCenterX = this.x + this.width / 2;
                
                // Corner logic
                if (petCenterX < cardLeft + borderRadius) {
                    const dx = (cardLeft + borderRadius) - petCenterX;
                    effectiveTop = cardTop + (borderRadius - Math.sqrt(Math.max(0, borderRadius * borderRadius - dx * dx)));
                } else if (petCenterX > cardRight - borderRadius) {
                    const dx = petCenterX - (cardRight - borderRadius);
                    effectiveTop = cardTop + (borderRadius - Math.sqrt(Math.max(0, borderRadius * borderRadius - dx * dx)));
                }

                if (this.y + this.height >= effectiveTop && 
                    this.y + this.height <= effectiveTop + 20 && 
                    this.vy >= 0) {
                    this.y = effectiveTop - this.height;
                    if (effectiveTop > cardTop) {
                        const slope = (petCenterX < cardLeft + borderRadius) ? -1 : 1;
                        this.vx += slope * 0.2;
                    }
                    this.vy = 0;
                    this.isGrounded = true;
                    break;
                }
            }

            // Hanging logic (Side edges)
            const edgeThreshold = 10;
            const hangDepth = 40;
            if (this.y > cardTop && this.y < cardTop + hangDepth && !this.isGrounded) {
                if (Math.abs((this.x + this.width) - cardLeft) < edgeThreshold) {
                    this.x = cardLeft - this.width + 2;
                    this.isHanging = true;
                    this.hangSide = -1;
                } else if (Math.abs(this.x - cardRight) < edgeThreshold) {
                    this.x = cardRight - 2;
                    this.isHanging = true;
                    this.hangSide = 1;
                }
            }
        }

        const docHeight = Math.max(document.body.scrollHeight, document.documentElement.scrollHeight);
        if (this.y + this.height > docHeight) {
            this.y = docHeight - this.height;
            this.vy *= -this.bounce;
            if (Math.abs(this.vy) < 1) this.vy = 0;
            this.isGrounded = true;
        }
    }

    applyPosition() {
        this.el.style.left = `${this.x}px`;
        this.el.style.top = `${this.y}px`;
    }
}

class PixelPet extends PhysicsObject {
    constructor() {
        const el = document.createElement('div');
        el.className = 'pixel-pet pixel-pet--idle';
        document.body.appendChild(el);

        const firstCard = document.querySelector('.card, .stat-item, .featured-project');
        let startX = 100;
        let startY = 100;

        if (firstCard) {
            const rect = firstCard.getBoundingClientRect();
            startX = rect.left + rect.width / 2 - 16 + window.scrollX;
            startY = rect.top + window.scrollY - 32;
        }

        super(el, startX, startY);

        this.state = 'idle';
        this.isChasingBall = false;
        this.isRidingBall = false;
        this.ballTrickState = null;
        this.ballTrickTimer = 0;
        this.ballTrickPhase = 0;
        this._tiltForce = 0;
        this.init();
    }

    init() {
        this.tick();
        this.decideAction();
        this.initMobileTilt();
    }

    initMobileTilt() {
        // Only on touch devices
        if (!('ontouchstart' in window)) return;

        const handleOrientation = (e) => {
            // gamma: left-right tilt (-90 to 90)
            const gamma = e.gamma || 0;
            // Apply a small force proportional to tilt angle
            // Clamp to prevent extreme values
            const tiltAngle = Math.max(-30, Math.min(30, gamma));
            this._tiltForce = tiltAngle * 0.04; // Gentle sliding
        };

        // iOS 13+ requires permission
        if (typeof DeviceOrientationEvent !== 'undefined' &&
            typeof DeviceOrientationEvent.requestPermission === 'function') {
            // Create a one-time tap-to-enable prompt
            const enableBtn = document.createElement('button');
            enableBtn.className = 'tilt-enable-btn';
            enableBtn.textContent = '📱 기울기 활성화';
            enableBtn.setAttribute('aria-label', 'Enable tilt for bear movement');
            document.body.appendChild(enableBtn);

            enableBtn.addEventListener('click', () => {
                DeviceOrientationEvent.requestPermission()
                    .then(state => {
                        if (state === 'granted') {
                            window.addEventListener('deviceorientation', handleOrientation);
                        }
                    })
                    .catch(console.error);
                enableBtn.remove();
            }, { once: true });
        } else if ('DeviceOrientationEvent' in window) {
            // Android + non-Safari: just listen
            window.addEventListener('deviceorientation', handleOrientation);
        }
    }

    decideAction() {
        setInterval(() => {
            if (!this.isGrounded || this.isHanging || this.isHangingSubtitle || this.isRidingBall || this.isChasingBall) return;

            const chance = Math.random();
            if (chance > 0.3) { // 70% chance to do something
                const allCards = Array.from(document.querySelectorAll('.card, .stat-item, .tech-chip, .featured-project'));
                
                // ~15% chance: Jump to subtitle
                if (chance > 0.85) {
                    this.jumpToSubtitle();
                    return;
                }

                if (chance > 0.7) {
                    // ~15% chance: Jump to a nearby card
                    const nearbyCards = allCards.filter(card => {
                        const rect = card.getBoundingClientRect();
                        const cardX = rect.left + rect.width / 2 + window.scrollX;
                        const dist = Math.abs(this.x - cardX);
                        return dist > 50 && dist < 400;
                    });

                    if (nearbyCards.length > 0) {
                        const targetCard = nearbyCards[Math.floor(Math.random() * nearbyCards.length)];
                        const rect = targetCard.getBoundingClientRect();
                        this.jumpTowards(rect.left + rect.width / 2 + window.scrollX);
                        return;
                    }
                }

                // Default: Just walk around on the current platform
                this.vx = (Math.random() - 0.5) * 4;
            }
        }, 1500);
    }

    jumpTowards(targetX) {
        if (!this.isGrounded) return;
        
        const dx = targetX - this.x;
        // Limit horizontal velocity to max 8 pixels per frame
        this.vx = Math.max(-8, Math.min(8, dx * 0.04));
        this.vy = -10 - Math.random() * 4;
        this.isGrounded = false;
    }

    jumpToSubtitle() {
        if (!this.isGrounded) return;

        const subtitle = document.querySelector('.hero__role');
        if (!subtitle) return;

        const rect = subtitle.getBoundingClientRect();
        const subCenterX = rect.left + rect.width / 2 + window.scrollX;
        const subBottom = rect.top + window.scrollY + rect.height;

        // Calculate needed jump power based on vertical distance
        const dy = this.y - subBottom;
        if (dy < 20) return; // Too close or above - skip

        const dx = subCenterX - (this.x + this.width / 2);
        
        // Stronger jump to reach the subtitle
        const jumpPower = Math.min(18, Math.max(12, Math.sqrt(dy * 1.4)));
        this.vy = -jumpPower;
        
        // Calculate frames to reach top of arc
        const framesToApex = jumpPower / this.gravity;
        // Needed horizontal speed = distance / frames
        this.vx = Math.max(-10, Math.min(10, dx / framesToApex));
        
        this.isGrounded = false;
    }

    tick() {
        this.update();
        this.updateAnimations();
        requestAnimationFrame(() => this.tick());
    }

    updateAnimations() {
        this.el.classList.remove(
            'pixel-pet--idle', 'pixel-pet--walking', 'pixel-pet--jumping',
            'pixel-pet--falling', 'pixel-pet--hanging-subtitle', 'pixel-pet--chasing',
            'pixel-pet--riding-balance', 'pixel-pet--riding-wave', 'pixel-pet--riding-spin', 'pixel-pet--riding-kick'
        );

        if (this.isHangingSubtitle) {
            this.el.classList.add('pixel-pet--hanging-subtitle');
            this.el.style.transform = 'scaleX(1)';
            return;
        }

        // Riding the ball — circus tricks!
        if (this.isRidingBall && this.ballTrickState) {
            this.el.classList.add('pixel-pet--riding-' + this.ballTrickState);
            this.el.style.setProperty('--face-dir', this.ballFacingDir || 1);
            this.el.style.transform = '';
            return;
        }

        if (!this.isGrounded) {
            if (this.vy < 0) this.el.classList.add('pixel-pet--jumping');
            else this.el.classList.add('pixel-pet--falling');
        } else if (this.isChasingBall) {
            this.el.classList.add('pixel-pet--chasing');
        } else {
            if (Math.abs(this.vx) > 0.5) {
                this.el.classList.add('pixel-pet--walking');
            } else {
                this.el.classList.add('pixel-pet--idle');
            }
        }

        // Flip
        if (Math.abs(this.vx) > 0.1) {
            const scaleX = this.vx > 0 ? 1 : -1;
            this.el.style.transform = `scaleX(${scaleX})`;
        }
    }
}

document.addEventListener('DOMContentLoaded', () => {
    // Only run if we are on a page with cards (primarily index)
    // AND ensure we don't have a pet already
    if ((document.querySelector('.bento-grid') || document.querySelector('.card')) && !document.querySelector('.pixel-pet')) {
        setTimeout(() => {
            if (!document.querySelector('.pixel-pet')) {
                new PixelPet();
            }
        }, 1000);
    }
});
