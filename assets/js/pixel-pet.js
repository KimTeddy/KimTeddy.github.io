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
    }

    update() {
        this.vy += this.gravity;
        this.vx *= this.friction;

        this.x += this.vx;
        this.y += this.vy;

        this.checkCollisions();
        this.applyPosition();
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
        this.init();
    }

    init() {
        this.tick();
        this.decideAction();
    }

    decideAction() {
        setInterval(() => {
            if (!this.isGrounded || this.isHanging) return;

            const chance = Math.random();
            if (chance > 0.3) { // 70% chance to do something
                const allCards = Array.from(document.querySelectorAll('.card, .stat-item, .tech-chip, .featured-project'));
                
                if (chance > 0.7) {
                    // 30% of the time: Jump to a nearby card
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

    tick() {
        this.update();
        this.updateAnimations();
        requestAnimationFrame(() => this.tick());
    }

    updateAnimations() {
        this.el.classList.remove('pixel-pet--idle', 'pixel-pet--walking', 'pixel-pet--jumping', 'pixel-pet--falling');

        if (!this.isGrounded) {
            if (this.vy < 0) this.el.classList.add('pixel-pet--jumping');
            else this.el.classList.add('pixel-pet--falling');
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
