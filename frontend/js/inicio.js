/**
 * pmsl-terceiros: inicio.js
 * Tela inicial em cartões (padrão SIAG): favoritos no topo, na ordem do usuário
 * (arrastar com o mouse ou Alt + setas no teclado), e todos os módulos por grupo.
 * Desenvolvido por BeMo Sistemas — Bernardo Mozelli de Medeiros
 */
(function () {
    const esc = (t) => String(t ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    let arrastando = null;

    function saudacao() {
        const h = new Date().getHours();
        const s = h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite';
        const nome = ((window.userInfo && window.userInfo.nome) || '').trim().split(' ')[0];
        document.getElementById('inicioSaudacao').textContent = nome ? `${s}, ${nome}!` : `${s}!`;
    }

    const modulosDoUsuario = () => (window.PMSL_MODULOS || []).filter(m => !window.pmslTemPermissao || window.pmslTemPermissao(m.permissao));

    function cartao(m, favorito) {
        const on = window.PmslFavoritos.ehFavorito(m.pagina);
        return `
        <a class="pmsl-card${favorito ? ' fav' : ''}" href="${esc(m.pagina)}" data-pagina="${esc(m.pagina)}"${favorito ? ' draggable="true"' : ''}>
            <span class="pmsl-card-ico"><i class="fas ${esc(m.icone)}"></i></span>
            <span class="pmsl-card-tit">${esc(m.titulo)}</span>
            <span class="pmsl-card-txt">${esc(m.texto)}</span>
            <button type="button" class="pmsl-card-pin${on ? ' on' : ''}" data-pagina="${esc(m.pagina)}"
                title="${on ? 'Desafixar do Início' : 'Fixar no Início'}" aria-label="${on ? 'Desafixar' : 'Fixar'} ${esc(m.titulo)}">
                <i class="fas fa-thumbtack"></i>
            </button>
        </a>`;
    }

    function ordemFavoritos(mods) {
        const st = window.PmslFavoritos.estado();
        const fav = st.favoritos.map(p => mods.find(m => m.pagina === p)).filter(Boolean);
        const pos = (p) => { const i = (st.ordem || []).indexOf(p); return i < 0 ? 9999 : i; };
        return fav.map((m, i) => ({ m, i })).sort((a, b) => (pos(a.m.pagina) - pos(b.m.pagina)) || (a.i - b.i)).map(x => x.m);
    }

    function render() {
        if (!window.PmslFavoritos) return;
        saudacao();
        const mods = modulosDoUsuario();
        const favs = ordemFavoritos(mods);
        document.getElementById('inicioCarregando').classList.add('d-none');

        document.getElementById('gradeFavoritos').innerHTML = favs.map(m => cartao(m, true)).join('');
        document.getElementById('favoritosVazio').classList.toggle('d-none', favs.length > 0);
        document.getElementById('dicaOrdem').classList.toggle('d-none', favs.length < 2);

        const grupos = [];
        mods.forEach(m => { let g = grupos.find(x => x.nome === m.grupo); if (!g) grupos.push(g = { nome: m.grupo, itens: [] }); g.itens.push(m); });
        document.getElementById('secoesModulos').innerHTML = grupos.map(g => `
            <section class="pmsl-secao">
                <div class="pmsl-secao-titulo"><span>${esc(g.nome)}</span></div>
                <div class="pmsl-grade">${g.itens.map(m => cartao(m, false)).join('')}</div>
            </section>`).join('') || '<p class="text-muted">Seu perfil ainda não tem módulos liberados. Fale com o administrador.</p>';
    }

    function gravarOrdem(paginas, foco) {
        const st = window.PmslFavoritos.estado();
        window.PmslFavoritos.salvar({ ...st, ordem: paginas });
        if (foco) setTimeout(() => { const el = document.querySelector(`#gradeFavoritos [data-pagina="${CSS.escape(foco)}"]`); if (el) el.focus(); }, 60);
    }
    const paginasFavoritas = () => Array.from(document.querySelectorAll('#gradeFavoritos .pmsl-card')).map(c => c.dataset.pagina);

    function ligarEventos() {
        const area = document.querySelector('.pmsl-inicio');

        // Alfinete do cartão
        area.addEventListener('click', (e) => {
            const b = e.target.closest('.pmsl-card-pin');
            if (!b) return;
            e.preventDefault(); e.stopPropagation();
            window.PmslFavoritos.alternar(b.dataset.pagina);
        });

        // Arrastar para reordenar os favoritos
        const grade = document.getElementById('gradeFavoritos');
        grade.addEventListener('dragstart', (e) => {
            const c = e.target.closest('.pmsl-card'); if (!c) return;
            arrastando = c.dataset.pagina; c.classList.add('arrastando');
            e.dataTransfer.effectAllowed = 'move';
            try { e.dataTransfer.setData('text/plain', arrastando); } catch (_) {}
        });
        grade.addEventListener('dragover', (e) => {
            if (!arrastando) return; e.preventDefault();
            grade.querySelectorAll('.pmsl-card').forEach(c => c.classList.toggle('alvo', c === e.target.closest('.pmsl-card') && c.dataset.pagina !== arrastando));
        });
        grade.addEventListener('drop', (e) => {
            e.preventDefault();
            const alvo = e.target.closest('.pmsl-card');
            if (arrastando && alvo && alvo.dataset.pagina !== arrastando) {
                const lista = paginasFavoritas();
                const de = lista.indexOf(arrastando), para = lista.indexOf(alvo.dataset.pagina);
                lista.splice(para, 0, lista.splice(de, 1)[0]);
                gravarOrdem(lista, arrastando);
            }
        });
        grade.addEventListener('dragend', () => {
            arrastando = null;
            grade.querySelectorAll('.pmsl-card').forEach(c => c.classList.remove('arrastando', 'alvo'));
        });

        // Teclado: Alt + setas move o cartão selecionado
        grade.addEventListener('keydown', (e) => {
            if (!(e.altKey || e.ctrlKey)) return;
            const d = { ArrowLeft: -1, ArrowUp: -1, ArrowRight: 1, ArrowDown: 1 }[e.key];
            const c = e.target.closest('.pmsl-card');
            if (!d || !c) return;
            e.preventDefault();
            const lista = paginasFavoritas(), de = lista.indexOf(c.dataset.pagina), para = de + d;
            if (para < 0 || para >= lista.length) return;
            lista.splice(para, 0, lista.splice(de, 1)[0]);
            gravarOrdem(lista, c.dataset.pagina);
        });
    }

    document.addEventListener('DOMContentLoaded', ligarEventos);
    document.addEventListener('pmsl-usuario-pronto', render);
    document.addEventListener('pmsl-favoritos', render);
})();
