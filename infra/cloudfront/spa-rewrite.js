// CloudFront Function (runtime cloudfront-js-2.0), viewer-request on the web distribution.
// Rewrites SPA routes to /index.html so deep links work, but never touches:
//  - /.well-known/* (apple-app-site-association and assetlinks.json must be served as-is, no redirect)
//  - /app/*          (the "open this link on your phone" fallback page for App Links / Universal Links)
//  - /api/*          (routed to the API origin)
//  - paths with a file extension (built assets)
// It also redirects www.diabeteasy.com to the apex with 301 (the refresh cookie is host-only).
function handler(event) {
  var request = event.request;
  var uri = request.uri;
  var host = request.headers && request.headers.host ? request.headers.host.value : '';
  if (host.indexOf('www.') === 0) {
    var qs = [];
    var q = request.querystring || {};
    for (var key in q) {
      if (q[key].multiValue) {
        for (var i = 0; i < q[key].multiValue.length; i++) qs.push(key + '=' + q[key].multiValue[i].value);
      } else {
        qs.push(key + (q[key].value !== '' ? '=' + q[key].value : ''));
      }
    }
    return {
      statusCode: 301,
      statusDescription: 'Moved Permanently',
      headers: { location: { value: 'https://' + host.substring(4) + uri + (qs.length ? '?' + qs.join('&') : '') } },
    };
  }
  if (uri.indexOf('/.well-known/') === 0 || uri.indexOf('/api/') === 0) {
    return request;
  }
  if (uri === '/app' || uri.indexOf('/app/') === 0) {
    request.uri = '/app/index.html';
    return request;
  }
  var last = uri.substring(uri.lastIndexOf('/') + 1);
  if (last.indexOf('.') !== -1) {
    return request;
  }
  request.uri = '/index.html';
  return request;
}
