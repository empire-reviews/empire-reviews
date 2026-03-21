/**
 * Empire Reviews – Leave a Review Form Widget
 * Renders an interactive star picker modal and submits reviews to /api/reviews.
 */
(function () {
  'use strict';

  var LABELS = ['', 'Poor', 'Fair', 'Good', 'Very Good', 'Excellent'];

  window.empireOpenReviewForm = function () {
    var modal = document.getElementById('empire-review-modal');
    if (modal) { modal.style.display = 'flex'; document.body.style.overflow = 'hidden'; }
  };

  window.empireCloseReviewForm = function () {
    var modal = document.getElementById('empire-review-modal');
    if (modal) { modal.style.display = 'none'; document.body.style.overflow = ''; }
  };

  window.empireHoverStar = function (star) {
    var wrap  = star.closest('.empire-star-picker');
    var color = wrap.dataset.starColor || '#fbbf24';
    var val   = parseInt(star.dataset.val);
    wrap.querySelectorAll('.empire-pick-star').forEach(function (s) {
      s.setAttribute('fill', parseInt(s.dataset.val) <= val ? color : '#e5e7eb');
    });
    var lbl = wrap.querySelector('.empire-star-label');
    if (lbl) lbl.textContent = LABELS[val] || '';
  };

  window.empireResetStars = function () {
    document.querySelectorAll('.empire-star-picker').forEach(function (wrap) {
      var current = parseInt(wrap.dataset.rating || '0');
      var color   = wrap.dataset.starColor || '#fbbf24';
      wrap.querySelectorAll('.empire-pick-star').forEach(function (s) {
        s.setAttribute('fill', parseInt(s.dataset.val) <= current ? color : '#e5e7eb');
      });
      var lbl = wrap.querySelector('.empire-star-label');
      if (lbl) lbl.textContent = current > 0 ? (LABELS[current] || '') : '';
    });
  };

  window.empirePickStar = function (star) {
    var wrap = star.closest('.empire-star-picker');
    var val  = parseInt(star.dataset.val);
    wrap.dataset.rating = val;
    var input = document.getElementById('empire-rating-input');
    if (input) input.value = val;
    empireResetStars();
  };

  window.empireSubmitReview = function (e, form) {
    e.preventDefault();
    var rating = parseInt((document.getElementById('empire-rating-input') || {}).value || '0');
    var errEl  = document.getElementById('empire-form-error');
    var sucEl  = document.getElementById('empire-form-success');
    var btn    = document.getElementById('empire-submit-btn');

    if (errEl) errEl.style.display = 'none';
    if (sucEl) sucEl.style.display = 'none';

    if (!rating || rating < 1) {
      if (errEl) { errEl.textContent = 'Please select a star rating.'; errEl.style.display = 'block'; }
      return;
    }

    var wrap    = form.closest('.empire-review-form-wrap') || form;
    var appUrl  = ((wrap.dataset && wrap.dataset.appUrl) || window.EMPIRE_APP_URL || 'https://empire-reviews.vercel.app').replace(/\/$/, '');
    var sucMsg  = (wrap.dataset && wrap.dataset.successMsg) || '🎉 Thank you! Your review has been submitted for approval.';

    if (btn) { btn.textContent = 'Submitting…'; btn.disabled = true; }

    fetch(appUrl + '/api/reviews', { method: 'POST', body: new FormData(form) })
      .then(function (r) { return r.json(); })
      .then(function (res) {
        if (res.success) {
          form.style.display = 'none';
          if (sucEl) { sucEl.textContent = sucMsg; sucEl.style.display = 'block'; }
          setTimeout(empireCloseReviewForm, 3500);
        } else {
          throw new Error(res.error || 'Submission failed');
        }
      })
      .catch(function (err) {
        if (btn) { btn.textContent = 'Submit Review →'; btn.disabled = false; }
        if (errEl) { errEl.textContent = err.message || 'Something went wrong.'; errEl.style.display = 'block'; }
      });
  };

  // Backdrop click to close
  document.addEventListener('DOMContentLoaded', function () {
    var modal = document.getElementById('empire-review-modal');
    if (modal) {
      modal.addEventListener('click', function (e) {
        if (e.target === modal) empireCloseReviewForm();
      });
    }
  });
})();
