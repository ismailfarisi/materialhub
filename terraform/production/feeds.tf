# ─── S3 bucket for sales-channel feed files (CloudFront-only access) ───
resource "aws_s3_bucket" "channel_feeds" {
  bucket = "${var.project_name}-channel-feeds-prod"
  tags = {
    Name        = "${var.project_name}-${var.environment}-channel-feeds"
    Environment = var.environment
  }
}

resource "aws_s3_bucket_versioning" "channel_feeds" {
  bucket = aws_s3_bucket.channel_feeds.id
  versioning_configuration { status = "Enabled" }
}

resource "aws_s3_bucket_public_access_block" "channel_feeds" {
  bucket                  = aws_s3_bucket.channel_feeds.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# ─── ACM cert in us-east-1 (CloudFront requirement) ───
resource "aws_acm_certificate" "channel_feeds" {
  provider          = aws.us_east_1
  domain_name       = var.feed_subdomain
  validation_method = "DNS"
  lifecycle { create_before_destroy = true }
  tags = {
    Name        = "${var.project_name}-${var.environment}-channel-feeds-cert"
    Environment = var.environment
  }
}

resource "aws_route53_record" "channel_feeds_cert_validation" {
  for_each = {
    for dvo in aws_acm_certificate.channel_feeds.domain_validation_options : dvo.domain_name => {
      name   = dvo.resource_record_name
      record = dvo.resource_record_value
      type   = dvo.resource_record_type
    }
  }
  zone_id         = data.aws_route53_zone.main.zone_id
  name            = each.value.name
  type            = each.value.type
  ttl             = 60
  records         = [each.value.record]
  allow_overwrite = true
}

resource "aws_acm_certificate_validation" "channel_feeds" {
  provider                = aws.us_east_1
  certificate_arn         = aws_acm_certificate.channel_feeds.arn
  validation_record_fqdns = [for r in aws_route53_record.channel_feeds_cert_validation : r.fqdn]
}

# ─── CloudFront OAC + distribution ───
data "aws_cloudfront_cache_policy" "disabled" {
  name = "Managed-CachingDisabled"
}

resource "aws_cloudfront_origin_access_control" "channel_feeds" {
  name                              = "${var.project_name}-${var.environment}-channel-feeds-oac"
  description                       = "OAC for sales-channel feed bucket"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

resource "aws_cloudfront_distribution" "channel_feeds" {
  enabled             = true
  is_ipv6_enabled     = true
  comment             = "${var.project_name}-${var.environment} sales-channel feeds"
  price_class         = "PriceClass_200"
  aliases             = [var.feed_subdomain]
  default_root_object = ""

  origin {
    domain_name              = aws_s3_bucket.channel_feeds.bucket_regional_domain_name
    origin_id                = "s3-channel-feeds"
    origin_access_control_id = aws_cloudfront_origin_access_control.channel_feeds.id
  }

  default_cache_behavior {
    target_origin_id       = "s3-channel-feeds"
    viewer_protocol_policy = "redirect-to-https"
    allowed_methods        = ["GET", "HEAD", "OPTIONS"]
    cached_methods         = ["GET", "HEAD"]
    compress               = true
    # Managed-CachingOptimized is wrong here — feeds change every 2h and platforms
    # respect Cache-Control. Use Managed-CachingDisabled and let the integration
    # service set Cache-Control: max-age=300 on the upload.
    cache_policy_id = data.aws_cloudfront_cache_policy.disabled.id
  }

  restrictions {
    geo_restriction { restriction_type = "none" }
  }

  viewer_certificate {
    acm_certificate_arn      = aws_acm_certificate_validation.channel_feeds.certificate_arn
    ssl_support_method       = "sni-only"
    minimum_protocol_version = "TLSv1.2_2021"
  }

  tags = {
    Name        = "${var.project_name}-${var.environment}-channel-feeds"
    Environment = var.environment
  }
}

# ─── S3 bucket policy: allow this CloudFront distribution only ───
resource "aws_s3_bucket_policy" "channel_feeds" {
  bucket = aws_s3_bucket.channel_feeds.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Sid       = "AllowCloudFrontServicePrincipalReadOnly"
      Effect    = "Allow"
      Principal = { Service = "cloudfront.amazonaws.com" }
      Action    = "s3:GetObject"
      Resource  = "${aws_s3_bucket.channel_feeds.arn}/*"
      Condition = {
        StringEquals = {
          "AWS:SourceArn" = aws_cloudfront_distribution.channel_feeds.arn
        }
      }
    }]
  })
}
