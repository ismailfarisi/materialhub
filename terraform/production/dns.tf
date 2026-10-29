# api.materialhubuae.com → Elastic IP (Caddy terminates TLS here)
resource "aws_route53_record" "api" {
  zone_id = data.aws_route53_zone.main.zone_id
  name    = var.api_subdomain
  type    = "A"
  ttl     = 300
  records = [aws_eip.app.public_ip]
}

# cdn.materialhubuae.com → CloudFront distribution
resource "aws_route53_record" "cdn" {
  zone_id = data.aws_route53_zone.main.zone_id
  name    = var.cdn_subdomain
  type    = "A"

  alias {
    name                   = aws_cloudfront_distribution.media.domain_name
    zone_id                = aws_cloudfront_distribution.media.hosted_zone_id
    evaluate_target_health = false
  }
}

# feeds.materialhubuae.com → CloudFront distribution for sales-channel feed files
resource "aws_route53_record" "feeds" {
  zone_id = data.aws_route53_zone.main.zone_id
  name    = var.feed_subdomain
  type    = "A"

  alias {
    name                   = aws_cloudfront_distribution.channel_feeds.domain_name
    zone_id                = aws_cloudfront_distribution.channel_feeds.hosted_zone_id
    evaluate_target_health = false
  }
}
