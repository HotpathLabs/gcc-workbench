/*
 * Treemap view for the GCC Workbench memory map.
 *
 * Three drill-down levels: regions -> sections -> symbols. Cell area is
 * proportional to size in bytes. Exposes window.TreemapView.init(layout).
 */
(function () {
    var COLORS = [
        '#4477AA', '#66CCEE', '#228833', '#CCBB44', '#EE6677', '#AA3377',
        '#BBBBBB', '#EE8866', '#44BB99', '#99DDFF', '#EEDD88', '#FFAABB',
    ];
    var GAP = 2;
    var MIN_LABEL_W = 46;
    var MIN_LABEL_H = 22;

    var layout = null;
    var path = [];            // drill-down stack: [{ kind: 'region'|'section', name }]
    var colorOfSection = {};  // section name -> palette index (matches the bar view)
    var lastNodes = [];

    function fmtSize(bytes) {
        if (bytes >= 1024 * 1024) { return (bytes / (1024 * 1024)).toFixed(2) + ' MB'; }
        if (bytes >= 1024) { return (bytes / 1024).toFixed(1) + ' KB'; }
        return bytes + ' B';
    }

    function fmtHex(v) {
        return '0x' + v.toString(16).toUpperCase().padStart(8, '0');
    }

    function esc(s) {
        return String(s).replace(/[&<>"]/g, function (c) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
        });
    }

    function shade(hex, amt) {
        var n = parseInt(hex.replace('#', ''), 16);
        var r = Math.min(255, Math.max(0, (n >> 16) + amt));
        var g = Math.min(255, Math.max(0, ((n >> 8) & 255) + amt));
        var b = Math.min(255, Math.max(0, (n & 255) + amt));
        return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
    }

    function assignColors() {
        colorOfSection = {};
        var idx = 0;
        layout.regions.forEach(function (region) {
            if (region.length === 0) { return; }
            region.sections.slice().sort(function (a, b) { return a.address - b.address; })
                .forEach(function (sec) {
                    colorOfSection[sec.name] = idx % COLORS.length;
                    idx++;
                });
        });
    }

    function findRegion(name) {
        return layout.regions.filter(function (r) { return r.name === name; })[0];
    }

    function findSection(regionName, name) {
        var region = findRegion(regionName);
        return region && region.sections.filter(function (s) { return s.name === name; })[0];
    }

    // ── Data for the current level ──

    function buildNodes() {
        var nodes = [];
        if (path.length === 0) {
            layout.regions.forEach(function (r, i) {
                if (r.length === 0) { return; }
                var used = r.used || r.sections.reduce(function (s, x) { return s + x.size; }, 0);
                if (used <= 0) { return; }
                nodes.push({
                    kind: 'region', name: r.name, size: used, region: r,
                    color: COLORS[i % COLORS.length],
                    sub: fmtSize(used) + ' / ' + fmtSize(r.length) + ' (' + (used / r.length * 100).toFixed(1) + '%)',
                });
            });
        } else if (path.length === 1) {
            var region = findRegion(path[0].name);
            if (!region) { return nodes; }
            var used = 0;
            region.sections.forEach(function (s) {
                if (s.size <= 0) { return; }
                used += s.size;
                nodes.push({
                    kind: 'section', name: s.name, size: s.size, section: s, region: region,
                    color: COLORS[(colorOfSection[s.name] || 0) % COLORS.length],
                    sub: fmtSize(s.size) + ' · ' + (s.symbols ? s.symbols.length : 0) + ' sym',
                });
            });
            var free = region.length - used;
            if (free > 0) {
                nodes.push({ kind: 'free', name: 'Free', size: free, sub: fmtSize(free), color: '#2b2b2b' });
            }
        } else {
            var sec = findSection(path[0].name, path[1].name);
            if (!sec) { return nodes; }
            var color = COLORS[(colorOfSection[sec.name] || 0) % COLORS.length];
            var sum = 0;
            (sec.symbols || []).forEach(function (sym, i) {
                if (sym.size <= 0) { return; }
                sum += sym.size;
                nodes.push({
                    kind: 'symbol', name: sym.name, size: sym.size, symbol: sym, section: sec,
                    color: shade(color, ((i % 5) - 2) * 14),
                    sub: fmtSize(sym.size),
                });
            });
            var rest = sec.size - sum;
            if (rest > 0) {
                nodes.push({
                    kind: nodes.length ? 'padding' : 'free', name: nodes.length ? '(padding / other)' : sec.name,
                    size: rest, sub: fmtSize(rest), color: '#3a3a3a',
                });
            }
        }
        nodes.sort(function (a, b) { return b.size - a.size; });
        return nodes;
    }

    // ── Squarified layout ──

    function worst(row, sum, side) {
        var max = 0, min = Infinity;
        row.forEach(function (n) {
            if (n.area > max) { max = n.area; }
            if (n.area < min) { min = n.area; }
        });
        var s2 = side * side, sum2 = sum * sum;
        return Math.max((s2 * max) / sum2, sum2 / (s2 * min));
    }

    function squarify(nodes, x, y, w, h) {
        var total = nodes.reduce(function (s, n) { return s + n.size; }, 0);
        if (total <= 0 || w <= 0 || h <= 0) { return; }
        var scale = (w * h) / total;
        nodes.forEach(function (n) { n.area = n.size * scale; });

        var rest = nodes.slice();
        var rx = x, ry = y, rw = w, rh = h;
        while (rest.length) {
            var side = Math.min(rw, rh);
            var row = [rest[0]];
            var sum = rest[0].area;
            var i = 1;
            while (i < rest.length) {
                var next = sum + rest[i].area;
                if (worst(row.concat([rest[i]]), next, side) <= worst(row, sum, side)) {
                    row.push(rest[i]);
                    sum = next;
                    i++;
                } else {
                    break;
                }
            }
            rest = rest.slice(row.length);
            var thickness = sum / side;
            var off = 0;
            if (rw >= rh) {
                row.forEach(function (n) {
                    var len = n.area / thickness;
                    n.x = rx; n.y = ry + off; n.w = thickness; n.h = len;
                    off += len;
                });
                rx += thickness; rw -= thickness;
            } else {
                row.forEach(function (n) {
                    var len = n.area / thickness;
                    n.x = rx + off; n.y = ry; n.w = len; n.h = thickness;
                    off += len;
                });
                ry += thickness; rh -= thickness;
            }
        }
    }

    // ── Rendering ──

    function renderBreadcrumb() {
        var el = document.getElementById('treemap-breadcrumb');
        if (!el) { return; }
        var html = '<span class="breadcrumb-item" data-depth="0">All regions</span>';
        path.forEach(function (p, i) {
            html += '<span class="breadcrumb-separator">›</span>' +
                '<span class="breadcrumb-item" data-depth="' + (i + 1) + '">' + esc(p.name) + '</span>';
        });
        el.innerHTML = html;
        var items = el.querySelectorAll('.breadcrumb-item');
        items[items.length - 1].classList.add('current');
    }

    function renderCells() {
        var view = document.getElementById('treemap-view');
        if (!view) { return; }
        view.innerHTML = '';
        var tip = document.createElement('div');
        tip.className = 'treemap-tooltip';
        tip.id = 'treemap-tooltip';
        view.appendChild(tip);

        var W = view.clientWidth, H = view.clientHeight;
        lastNodes = buildNodes();
        if (!lastNodes.length) {
            var empty = document.createElement('div');
            empty.className = 'no-data';
            empty.textContent = 'Nothing to show at this level.';
            view.appendChild(empty);
            return;
        }
        squarify(lastNodes, 0, 0, W, H);

        lastNodes.forEach(function (n, idx) {
            var w = n.w - GAP, h = n.h - GAP;
            if (w < 1 || h < 1) { return; }
            var cell = document.createElement('div');
            cell.className = 'treemap-cell treemap-' + n.kind;
            cell.setAttribute('data-idx', String(idx));
            cell.style.left = (n.x + GAP / 2) + 'px';
            cell.style.top = (n.y + GAP / 2) + 'px';
            cell.style.width = w + 'px';
            cell.style.height = h + 'px';
            if (n.kind !== 'free' && n.kind !== 'padding') {
                cell.style.background = 'linear-gradient(145deg,' + shade(n.color, 22) + ',' + shade(n.color, -26) + ')';
            }
            if (n.kind === 'region' || n.kind === 'section') { cell.classList.add('drillable'); }
            if (w >= MIN_LABEL_W && h >= MIN_LABEL_H) {
                var label = document.createElement('div');
                label.className = 'treemap-cell-label';
                label.textContent = n.name;
                cell.appendChild(label);
                if (h >= 40) {
                    var size = document.createElement('div');
                    size.className = 'treemap-cell-size';
                    size.textContent = n.sub;
                    cell.appendChild(size);
                }
            }
            view.appendChild(cell);
        });
    }

    function render() {
        renderBreadcrumb();
        renderCells();
    }

    // ── Interaction ──

    function showTip(e, n) {
        var view = document.getElementById('treemap-view');
        var tip = document.getElementById('treemap-tooltip');
        if (!view || !tip) { return; }
        var rows = [['Size', fmtSize(n.size) + ' (' + n.size + ' B)']];
        if (n.kind === 'region') {
            rows.push(['Origin', fmtHex(n.region.origin)], ['Capacity', fmtSize(n.region.length)]);
        } else if (n.kind === 'section') {
            rows.push(['Address', fmtHex(n.section.address)], ['Symbols', String(n.section.symbols ? n.section.symbols.length : 0)]);
        } else if (n.kind === 'symbol') {
            rows.push(['Address', fmtHex(n.symbol.address)]);
            if (n.symbol.sourceFile) { rows.push(['Object', n.symbol.sourceFile]); }
        }
        tip.innerHTML = '<div class="tooltip-title">' + esc(n.name) + '</div>' + rows.map(function (r) {
            return '<div class="tooltip-row"><span class="tooltip-label">' + r[0] +
                '</span><span class="tooltip-value">' + esc(r[1]) + '</span></div>';
        }).join('');
        tip.classList.add('visible');
        var vr = view.getBoundingClientRect();
        var x = e.clientX - vr.left + 14, y = e.clientY - vr.top + 14;
        if (x + tip.offsetWidth > vr.width) { x = e.clientX - vr.left - tip.offsetWidth - 14; }
        if (y + tip.offsetHeight > vr.height) { y = e.clientY - vr.top - tip.offsetHeight - 14; }
        tip.style.left = Math.max(0, x) + 'px';
        tip.style.top = Math.max(0, y) + 'px';
    }

    function nodeOf(e) {
        var cell = e.target.closest('.treemap-cell');
        return cell ? lastNodes[Number(cell.getAttribute('data-idx'))] : null;
    }

    function wire() {
        var view = document.getElementById('treemap-view');
        var crumbs = document.getElementById('treemap-breadcrumb');
        if (!view || view.__wired) { return; }
        view.__wired = true;

        view.addEventListener('mousemove', function (e) {
            var n = nodeOf(e);
            var tip = document.getElementById('treemap-tooltip');
            if (n && n.kind !== 'free') { showTip(e, n); } else if (tip) { tip.classList.remove('visible'); }
        });
        view.addEventListener('mouseleave', function () {
            var tip = document.getElementById('treemap-tooltip');
            if (tip) { tip.classList.remove('visible'); }
        });
        view.addEventListener('click', function (e) {
            var n = nodeOf(e);
            if (!n) { return; }
            if (n.kind === 'region') {
                path = [{ kind: 'region', name: n.name }];
                render();
            } else if (n.kind === 'section') {
                path = [path[0], { kind: 'section', name: n.name }];
                window.mapViewIPC.postMessage({ type: 'selectSection', section: n.name, sourceLine: n.section.sourceLine });
                render();
            } else if (n.kind === 'symbol') {
                window.mapViewIPC.postMessage({
                    type: 'selectSymbol', symbol: n.name, section: n.section.name,
                    address: n.symbol.address, sourceLine: n.symbol.sourceLine,
                });
            }
        });
        view.addEventListener('dblclick', function (e) {
            var n = nodeOf(e);
            if (n && n.kind === 'symbol') {
                window.mapViewIPC.postMessage({
                    type: 'goToSource', symbol: n.name, section: n.section.name,
                    sourceFile: n.symbol.sourceFile, address: n.symbol.address, sourceLine: n.symbol.sourceLine,
                });
            }
        });
        crumbs.addEventListener('click', function (e) {
            var item = e.target.closest('.breadcrumb-item');
            if (!item) { return; }
            path = path.slice(0, Number(item.getAttribute('data-depth')));
            render();
        });

        var raf = 0;
        window.addEventListener('resize', function () {
            if (!document.getElementById('treemap-container') ||
                document.getElementById('treemap-container').style.display === 'none') { return; }
            cancelAnimationFrame(raf);
            raf = requestAnimationFrame(renderCells);
        });
    }

    window.TreemapView = {
        init: function (data) {
            layout = data;
            path = [];
            assignColors();
            wire();
            render();
        },
        /** Re-layout after the container becomes visible or changes size. */
        refresh: function () {
            if (layout) { renderCells(); }
        },
    };
})();
