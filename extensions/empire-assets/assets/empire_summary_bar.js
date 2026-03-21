/**
 * Empire Reviews – Summary Bar Widget
 * Fetches product review stats and renders avg rating + breakdown bars.
 */
(function () {
  'use strict';

  function renderStars(avg, color) {
    var html = '';
    for (var i = 1; i <= 5; i++) {
      var fill = i <= Math.round(avg) ? color : '#e5e7eb';
      html += '<svg viewBox="0 0 24 24" fill="' + fill + '" style="width:1.2em;height:1.2em;"><path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/></svg>';
    }
    return html;
  }

  function initSummaryBar(el) {
    var productId  = el.dataset.productId;
    var shop       = el.dataset.shop;
    var layout     = el.dataset.layout     || 'vertical';
    var showBars   = el.dataset.showBreakdown !== 'false';
    var showVerif  = el.dataset.showVerified  !== 'false';
    var emptyText  = el.dataset.emptyText  || 'Be the first to review this product';
    var starColor  = getComputedStyle(el).getPropertyValue('--esb-star').trim() || '#fbbf24';
    var appUrl     = (el.dataset.appUrl || window.EMPIRE_APP_URL || 'https://empire-reviews.vercel.app').replace(/\/$/, '');

    var apiUrl = appUrl + '/api/reviews?productId=' + productId + '&shop=' + encodeURIComponent(shop) + '&limit=250';

    fetch(apiUrl)
      .then(function (r) { return r.json(); })
      .then(function (data) {
        var stats   = data.stats   || {};
        var reviews = data.reviews || [];

        if (!stats.total || stats.total === 0) {
          el.innerHTML = '<span style="opacity:0.5;font-size:0.9em;">' + emptyText + '</span>';
          return;
        }

        var avg   = parseFloat(stats.average.toFixed(1));
        var total = stats.total;

        var dist = [5, 4, 3, 2, 1].map(function (star) {
          return { star: star, count: reviews.filter(function (r) { return r.rating === star; }).length };
        });

        if (layout === 'horizontal') {
          el.innerHTML =
            '<div class="esb-horizontal">' +
            '  <span class="esb-score-big">' + avg + '</span>' +
            '  <div>' +
            '    <div class="esb-stars-row">' + renderStars(avg, starColor) + '</div>' +
            '    <div class="esb-count-text">' + total + ' review' + (total !== 1 ? 's' : '') + '</div>' +
            '  </div>' +
            (showVerif ? '<span class="esb-verified">✓ Verified Buyers</span>' : '') +
            '</div>';
        } else {
          var barsHtml = showBars ? dist.map(function (d) {
            var pct = total > 0 ? Math.round((d.count / total) * 100) : 0;
            return '<div class="esb-bar-row">' +
              '<span class="esb-bar-label">' + d.star + '</span>' +
              '<div class="esb-bar-track"><div class="esb-bar-fill" style="width:' + pct + '%"></div></div>' +
              '<span class="esb-bar-count">' + d.count + '</span>' +
              '</div>';
          }).join('') : '';

          el.innerHTML =
            '<div class="esb-vertical">' +
            '  <div class="esb-left">' +
            '    <span class="esb-score-big">' + avg + '</span>' +
            '    <div class="esb-stars-row">' + renderStars(avg, starColor) + '</div>' +
            '    <span class="esb-count-text">' + total + ' review' + (total !== 1 ? 's' : '') + '</span>' +
            (showVerif ? '<span class="esb-verified">✓ Verified</span>' : '') +
            '  </div>' +
            (showBars ? '<div class="esb-right">' + barsHtml + '</div>' : '') +
            '</div>';
        }
      })
      .catch(function () {
        el.innerHTML = '<span style="opacity:0.4;font-size:0.85em;">Could not load review summary.</span>';
      });
  }

  document.querySelectorAll('.empire-summary-bar').forEach(initSummaryBar);
})();
