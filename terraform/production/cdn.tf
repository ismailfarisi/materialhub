# ─── Media bucket ─────────────────────────────────────────────
resource "aws_s3_bucket" "media" {
  bucket = "${var.project_name}-media-prod"

  tags = {
    Environment = var.environment
  }
}

resource "aws_s3_bucket_public_access_block" "media" {
  bucket                  = aws_s3_bucket.media.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_versioning" "media" {
  bucket = aws_s3_bucket.media.id
  versioning_configuration {
    status = "Enabled"
  }
}

# ─── ACM certificate for the CDN domain (must be in us-east-1) ────────────────
resource "aws_acm_certificate" "cdn" {
  provider          = aws.us_east_1
  domain_name       = var.cdn_subdomain
  validation_method = "DNS"

  lifecycle {
    create_before_destroy = true
  }
}

resource "aws_route53_record" "cdn_cert_validation" {
  for_each = {
    for dvo in aws_acm_certificate.cdn.domain_validation_options : dvo.domain_name => {
      name   = dvo.resource_record_name
      type   = dvo.resource_record_type
      record = dvo.resource_record_value
    }
  }

  zone_id         = data.aws_route53_zone.main.zone_id
  name            = each.value.name
  type            = each.value.type
  records         = [each.value.record]
  ttl             = 60
  allow_overwrite = true
}

resource "aws_acm_certificate_validation" "cdn" {
  provider                = aws.us_east_1
  certificate_arn         = aws_acm_certificate.cdn.arn
  validation_record_fqdns = [for r in aws_route53_record.cdn_cert_validation : r.fqdn]
}

# ─── CloudFront distribution ──────────────────────────────────
data "aws_cloudfront_cache_policy" "optimized" {
  name = "Managed-CachingOptimized"
}

resource "aws_cloudfront_origin_access_control" "media" {
  name                              = "${var.project_name}-media-prod-oac"
  description                       = "OAC for the production media bucket"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

# ─── Deny CDN access to private objects ───────────────────────
# The media bucket holds PII under private/* (receipts: name/address/phone;
# KYC docs). Those objects must ONLY ever be reachable via short-lived
# presigned S3 GETs (which go direct to S3, not through this distribution).
# Without this, CloudFront + the OAC bucket policy would serve
# https://<cdn>/private/receipts/<orderId>.pdf to anyone with the URL,
# bypassing the app's auth + ownership checks. This viewer-request function
# returns 403 for every private/* path so the CDN never serves those objects.
resource "aws_cloudfront_function" "deny_private" {
  name    = "${var.project_name}-media-prod-deny-private"
  runtime = "cloudfront-js-2.0"
  comment = "Return 403 for private/* so PII (receipts, KYC) is never served via the CDN"
  publish = true
  code    = <<-EOT
    function handler(event) {
      return {
        statusCode: 403,
        statusDescription: 'Forbidden',
        headers: { 'cache-control': { value: 'no-store' } }
      };
    }
  EOT
}

resource "aws_cloudfront_distribution" "media" {
  enabled         = true
  is_ipv6_enabled = true
  comment         = "${var.project_name} production media CDN"
  aliases         = [var.cdn_subdomain]
  price_class     = "PriceClass_200" # includes India + Middle East edge locations

  origin {
    domain_name              = aws_s3_bucket.media.bucket_regional_domain_name
    origin_id                = "s3-media"
    origin_access_control_id = aws_cloudfront_origin_access_control.media.id
  }

  default_cache_behavior {
    target_origin_id       = "s3-media"
    viewer_protocol_policy = "redirect-to-https"
    allowed_methods        = ["GET", "HEAD", "OPTIONS"]
    cached_methods         = ["GET", "HEAD"]
    compress               = true
    cache_policy_id        = data.aws_cloudfront_cache_policy.optimized.id
  }

  # Private PII objects (receipts, KYC) must never be served by the CDN —
  # this behavior 403s them at the edge. Public media (products, reels, etc.)
  # falls through to default_cache_behavior and is unaffected.
  ordered_cache_behavior {
    path_pattern           = "private/*"
    target_origin_id       = "s3-media"
    viewer_protocol_policy = "redirect-to-https"
    allowed_methods        = ["GET", "HEAD", "OPTIONS"]
    cached_methods         = ["GET", "HEAD"]
    compress               = true
    cache_policy_id        = data.aws_cloudfront_cache_policy.optimized.id

    function_association {
      event_type   = "viewer-request"
      function_arn = aws_cloudfront_function.deny_private.arn
    }
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  viewer_certificate {
    acm_certificate_arn      = aws_acm_certificate_validation.cdn.certificate_arn
    ssl_support_method       = "sni-only"
    minimum_protocol_version = "TLSv1.2_2021"
  }

  tags = {
    Environment = var.environment
  }
}

# ─── Bucket policy: allow only this CloudFront distribution to read ──────────
resource "aws_s3_bucket_policy" "media" {
  bucket = aws_s3_bucket.media.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Sid       = "AllowCloudFrontRead"
      Effect    = "Allow"
      Principal = { Service = "cloudfront.amazonaws.com" }
      Action    = "s3:GetObject"
      Resource  = "${aws_s3_bucket.media.arn}/*"
      Condition = {
        StringEquals = {
          "AWS:SourceArn" = aws_cloudfront_distribution.media.arn
        }
      }
    }]
  })
}
