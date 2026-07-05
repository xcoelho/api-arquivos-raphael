/**
 * ==========================================================================
 * RC CAVALCANTI - SITE INSTITUCIONAL JS
 * Comportamentos dinâmicos, Filtros, Toast e Animação de Canvas PCB
 * ==========================================================================
 */

// Utilidades rápidas
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

document.addEventListener('DOMContentLoaded', () => {
    initMobileMenu();
    initPortfolioFilters();
    initScrollSpy();
    initPcbCanvas();
});

/* ==========================================================================
   Menu Mobile
   ========================================================================== */
function initMobileMenu() {
    const toggle = $('#mobile-toggle');
    const menu = $('#mobile-menu');
    
    if (!toggle || !menu) return;
    
    toggle.addEventListener('click', (e) => {
        e.stopPropagation();
        toggle.classList.toggle('open');
        menu.classList.toggle('open');
    });
    
    // Fechar ao clicar nos links
    const mobileLinks = $$('.mobile-link');
    mobileLinks.forEach(link => {
        link.addEventListener('click', () => {
            toggle.classList.remove('open');
            menu.classList.remove('open');
        });
    });
    
    // Fechar ao clicar fora
    document.addEventListener('click', (e) => {
        if (!menu.contains(e.target) && !toggle.contains(e.target)) {
            toggle.classList.remove('open');
            menu.classList.remove('open');
        }
    });
}

/* ==========================================================================
   Filtros do Portfólio
   ========================================================================== */
function initPortfolioFilters() {
    const filterButtons = $$('.filter-btn');
    const portfolioItems = $$('.portfolio-item');
    
    filterButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            // Atualizar botão ativo
            filterButtons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            
            const filter = btn.getAttribute('data-filter');
            
            portfolioItems.forEach(item => {
                const category = item.getAttribute('data-category');
                
                if (filter === 'all' || category === filter) {
                    item.classList.remove('hidden');
                } else {
                    item.classList.add('hidden');
                }
            });
        });
    });
}

/* ==========================================================================
   Scrollspy (Atualização do Menu Ativo)
   ========================================================================== */
function initScrollSpy() {
    const sections = $$('section');
    const navLinks = $$('.home-nav .nav-link');
    
    window.addEventListener('scroll', () => {
        let currentSectionId = 'hero';
        const scrollPosition = window.scrollY + 120; // Compensação da altura do header fijo
        
        sections.forEach(section => {
            const sectionTop = section.offsetTop;
            const sectionHeight = section.offsetHeight;
            
            if (scrollPosition >= sectionTop && scrollPosition < sectionTop + sectionHeight) {
                currentSectionId = section.getAttribute('id');
            }
        });
        
        navLinks.forEach(link => {
            link.classList.remove('active');
            if (link.getAttribute('href') === `#${currentSectionId}`) {
                link.classList.add('active');
            }
        });
    });
}

/* ==========================================================================
   Sistema de Notificação (Toast)
   ========================================================================== */
function toast(message, type = 'info') {
    const container = $('#toast-container') || document.body;
    const el = document.createElement('div');
    el.className = `toast ${type}`;
    el.innerHTML = `<span>${type === 'success' ? '✅' : 'ℹ️'}</span> ${message}`;
    
    // Pequeno estilo dinâmico para o Toast na home que pode faltar em style.css
    el.style.position = 'fixed';
    el.style.bottom = '24px';
    el.style.right = '24px';
    el.style.backgroundColor = 'var(--bg-secondary)';
    el.style.border = `1px solid ${type === 'success' ? 'var(--accent-green)' : 'var(--border-color)'}`;
    el.style.color = 'var(--text-primary)';
    el.style.padding = '12px 20px';
    el.style.borderRadius = '8px';
    el.style.boxShadow = '0 8px 30px rgba(0, 0, 0, 0.5)';
    el.style.zIndex = '9999';
    el.style.display = 'flex';
    el.style.alignItems = 'center';
    el.style.gap = '10px';
    el.style.fontSize = '13px';
    el.style.fontWeight = '500';
    el.style.opacity = '0';
    el.style.transform = 'translateY(10px)';
    el.style.transition = 'opacity 0.3s, transform 0.3s';
    
    container.appendChild(el);
    
    // Forçar reflow
    el.offsetHeight;
    
    el.style.opacity = '1';
    el.style.transform = 'translateY(0)';
    
    setTimeout(() => {
        el.style.opacity = '0';
        el.style.transform = 'translateY(10px)';
        setTimeout(() => el.remove(), 300);
    }, 4000);
}

/* ==========================================================================
   Formulário de Contato Inteligente
   ========================================================================== */
window.submitContactForm = function() {
    const submitBtn = $('#contact-submit-btn');
    const form = $('#home-contact-form');
    
    if (!submitBtn || !form) return;
    
    const name = $('#contact-name').value;
    const email = $('#contact-email').value;
    const subject = $('#contact-subject').value;
    const message = $('#contact-message').value;
    
    if (!name || !email || !subject || !message) {
        toast('Por favor, preencha todos os campos do formulário.', 'error');
        return;
    }
    
    // Efeito de Envio/Carregamento
    const originalText = submitBtn.innerHTML;
    submitBtn.disabled = true;
    submitBtn.innerHTML = `<span>⏳</span> Enviando sua mensagem...`;
    
    setTimeout(() => {
        // Sucesso Simulado (perfeito para portfólio estático)
        toast(`Olá ${name}! Recebemos seu interesse em "${subject}". Entraremos em contato em breve no e-mail: ${email}.`, 'success');
        
        // Resetar Formulário
        form.reset();
        submitBtn.disabled = false;
        submitBtn.innerHTML = originalText;
    }, 1500);
};

/* ==========================================================================
   Canvas Interativo de Circuito Impresso (PCB) - Animação de Fundo
   ========================================================================== */
function initPcbCanvas() {
    const canvas = $('#pcb-canvas');
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    let width = canvas.width = canvas.offsetWidth;
    let height = canvas.height = canvas.offsetHeight;
    
    // Monitorar tamanho da janela
    window.addEventListener('resize', () => {
        width = canvas.width = canvas.offsetWidth;
        height = canvas.height = canvas.offsetHeight;
        generatePcbNetwork();
    });
    
    // Rastreamento do mouse
    let mouse = { x: null, y: null, radius: 120 };
    window.addEventListener('mousemove', (e) => {
        const rect = canvas.getBoundingClientRect();
        mouse.x = e.clientX - rect.left;
        mouse.y = e.clientY - rect.top;
    });
    
    window.addEventListener('mouseleave', () => {
        mouse.x = null;
        mouse.y = null;
    });

    let tracks = [];
    let dots = [];

    // Classe para representar uma trilha de circuito impresso
    class PcbTrack {
        constructor(points, colorType) {
            this.points = points; // Array de {x, y}
            this.colorType = colorType; // 'blue' ou 'green'
            this.opacity = Math.random() * 0.12 + 0.03; // Brilho de fundo padrão
            this.pulses = [];
            this.maxPulses = 1;
        }

        draw() {
            if (this.points.length < 2) return;
            
            ctx.beginPath();
            ctx.moveTo(this.points[0].x, this.points[0].y);
            for (let i = 1; i < this.points.length; i++) {
                ctx.lineTo(this.points[i].x, this.points[i].y);
            }
            
            // Verificar proximidade com o mouse para dar um glow sutil
            let isNearMouse = false;
            if (mouse.x !== null && mouse.y !== null) {
                for (let pt of this.points) {
                    let dist = Math.hypot(pt.x - mouse.x, pt.y - mouse.y);
                    if (dist < mouse.radius) {
                        isNearMouse = true;
                        break;
                    }
                }
            }

            ctx.lineWidth = 1.2;
            if (isNearMouse) {
                ctx.strokeStyle = this.colorType === 'blue' 
                    ? `rgba(88, 166, 255, ${this.opacity * 3.5})` 
                    : `rgba(63, 185, 80, ${this.opacity * 3.5})`;
                ctx.lineWidth = 1.8;
            } else {
                ctx.strokeStyle = this.colorType === 'blue' 
                    ? `rgba(88, 166, 255, ${this.opacity})` 
                    : `rgba(63, 185, 80, ${this.opacity})`;
            }
            ctx.stroke();

            // Desenhar ilhas de solda/vias nos nós terminais
            this.points.forEach((pt, index) => {
                if (index === 0 || index === this.points.length - 1) {
                    ctx.beginPath();
                    ctx.arc(pt.x, pt.y, 3, 0, Math.PI * 2);
                    ctx.fillStyle = isNearMouse ? '#ffffff' : (this.colorType === 'blue' ? '#354d6d' : '#274f31');
                    ctx.fill();
                    ctx.strokeStyle = this.colorType === 'blue' ? '#58a6ff' : '#3fb950';
                    ctx.lineWidth = 0.8;
                    ctx.stroke();
                }
            });
        }

        update() {
            // Spawn de pulsos elétricos com chance aleatória
            if (this.pulses.length < this.maxPulses && Math.random() < 0.005) {
                this.pulses.push(new ElectricPulse(this));
            }

            this.pulses.forEach((pulse, index) => {
                pulse.update();
                pulse.draw();
                if (pulse.finished) {
                    this.pulses.splice(index, 1);
                }
            });
        }
    }

    // Classe para representar o pulso elétrico (elétron em movimento)
    class ElectricPulse {
        constructor(track) {
            this.track = track;
            this.segmentIndex = 0;
            this.startPoint = track.points[0];
            this.endPoint = track.points[1];
            
            this.progress = 0; // de 0 a 1 no segmento atual
            this.speed = Math.random() * 0.015 + 0.01; // Velocidade do fluxo
            this.finished = false;
            
            this.currentX = this.startPoint.x;
            this.currentY = this.startPoint.y;
            this.color = track.colorType === 'blue' ? '#58a6ff' : '#3fb950';
            this.size = Math.random() * 1.5 + 1.5;
        }

        update() {
            this.progress += this.speed;
            if (this.progress >= 1) {
                this.progress = 0;
                this.segmentIndex++;
                if (this.segmentIndex >= this.track.points.length - 1) {
                    this.finished = true;
                    return;
                }
                this.startPoint = this.track.points[this.segmentIndex];
                this.endPoint = this.track.points[this.segmentIndex + 1];
            }

            // Interpolação linear de coordenadas
            this.currentX = this.startPoint.x + (this.endPoint.x - this.startPoint.x) * this.progress;
            this.currentY = this.startPoint.y + (this.endPoint.y - this.startPoint.y) * this.progress;
        }

        draw() {
            if (this.finished) return;

            // Desenhar rastro sutil (glow)
            ctx.beginPath();
            ctx.arc(this.currentX, this.currentY, this.size * 2.5, 0, Math.PI * 2);
            ctx.fillStyle = this.track.colorType === 'blue' ? 'rgba(88, 166, 255, 0.15)' : 'rgba(63, 185, 80, 0.15)';
            ctx.fill();

            // Desenhar núcleo brilhante
            ctx.beginPath();
            ctx.arc(this.currentX, this.currentY, this.size, 0, Math.PI * 2);
            ctx.fillStyle = '#ffffff';
            ctx.shadowColor = this.color;
            ctx.shadowBlur = 8;
            ctx.fill();
            
            // Resetar sombra do canvas para não arruinar performance
            ctx.shadowBlur = 0;
        }
    }

    // Gerar a malha de circuito impresso proporcional ao tamanho da tela
    function generatePcbNetwork() {
        tracks = [];
        
        // Densidade de trilhas baseada em desktop ou mobile
        const trackCount = width > 768 ? 24 : 12;
        
        for (let i = 0; i < trackCount; i++) {
            let points = [];
            
            // Começar nas bordas ou pontos randômicos
            let x = Math.random() * width;
            let y = Math.random() * height;
            points.push({ x, y });
            
            const segmentCount = Math.floor(Math.random() * 3) + 2; // 2 a 4 segmentos por trilha
            let currentX = x;
            let currentY = y;
            
            for (let j = 0; j < segmentCount; j++) {
                // Trilhas eletrônicas reais seguem ângulos ortogonais de 45° ou 90°
                let length = Math.random() * 80 + 50;
                let angleType = Math.floor(Math.random() * 3); // 0 = 90 graus horizontal, 1 = vertical, 2 = 45 graus diagonal
                
                if (angleType === 0) {
                    currentX += (Math.random() > 0.5 ? 1 : -1) * length;
                } else if (angleType === 1) {
                    currentY += (Math.random() > 0.5 ? 1 : -1) * length;
                } else {
                    let sideX = Math.random() > 0.5 ? 1 : -1;
                    let sideY = Math.random() > 0.5 ? 1 : -1;
                    currentX += sideX * length * 0.707; // Trigonometria de 45°
                    currentY += sideY * length * 0.707;
                }
                
                // Manter dentro do canvas
                currentX = Math.max(10, Math.min(width - 10, currentX));
                currentY = Math.max(10, Math.min(height - 10, currentY));
                
                points.push({ x: currentX, y: currentY });
            }
            
            const colorType = Math.random() > 0.6 ? 'green' : 'blue';
            tracks.push(new PcbTrack(points, colorType));
        }
    }

    generatePcbNetwork();

    // Loop de Animação Principal
    function animate() {
        ctx.clearRect(0, 0, width, height);
        
        // Desenhar e atualizar todas as trilhas e pulsos
        tracks.forEach(track => {
            track.draw();
            track.update();
        });
        
        requestAnimationFrame(animate);
    }
    
    animate();
}
