# Disintermediation ("platform leakage") in B2B marketplaces: severity and mitigation for MaterialHub UAE

Method note: in this session the full-text fetch tool could not reach university hosts (kellogg.northwestern.edu, anderson-review.ucla.edu, acem.sjtu.edu.cn returned DNS failures). Findings below come from search-engine extracts of abstracts, help-centre pages and filings, not from reading the full papers. Figures marked "(abstract-level)" should be checked against the paper before being quoted in a final report.

## 1. Evidence on leakage rates and dynamics, and which categories are most at risk

### Takeaway
The measured leakage rates vary widely, from under about 1.2% of relationships (a home-cleaning app) to 5.4% or 22.4% of nights (Airbnb Austin, depending on paper version), and a commission introduction roughly doubled leakage on a services platform. The most consistent result is about who leaks, not how much: repeat pairs, high-value orders, high-trust relationships and anything fulfilled offline leak most. Packaging-materials reorders fit that profile.

### Cited Findings
**Measured rates (empirical)**
- Airbnb, Austin TX, 2019: one version of Lin, Nian & Foutz estimates a **5.4%** disintermediation rate using daily occupancy data. A later version reports **22.4%** for the Austin sample, tied to an estimated **$1.1bn** annual revenue loss to Airbnb. The two figures come from different versions or definitions (abstract-level) — [ICIS 2022 proceedings](https://aisel.aisnet.org/icis2022/sharing_econ/sharing_econ/12/); [UCLA Anderson Review](https://anderson-review.ucla.edu/a-renter-and-property-owner-meet-on-airbnb-will-they-ditch-the-site/); [PlatStrat 2022 paper](https://questromworld.bu.edu/platformstrategy/wp-content/uploads/sites/49/2022/07/PlatStrat2022_paper_37.pdf)
- In the same Airbnb work, Instant Bookable reduces disintermediation by about **9%**. The effect is stronger for hosts with **more repeat guests** and more hosting experience. A later abstract says Instant Book and Airbnb Plus deter **30.2%** and **23.5%** of disintermediated days respectively (abstract-level) — [ICIS 2022](https://aisel.aisnet.org/icis2022/sharing_econ/sharing_econ/12/); [Jinan Lin research page](https://sites.google.com/wisc.edu/jinanlin/research)
- Counter-evidence (working paper, not peer-reviewed): Astashkina, Bray, Momot & Salikhov, "A Disquieting Lack of Evidence for Disintermediation", studies a home-cleaning platform and finds that **no more than 1 in 83** relationships formed on the app ended in disintermediation. It also criticises the Airbnb method: off-platform occupancy counts as disintermediation only if the guest found the unit through Airbnb — [Kellogg working paper](https://www.kellogg.northwestern.edu/faculty/bray/doc/disintermediation/disintermediation.pdf)
- Xie & Zhu, "Platform Leakage: Incentive Conflicts in Two-Sided Markets", studies a services platform (driver/customer pairs) that rolled out a **15% commission** to non-VIP drivers from 2019. The commission raised leakage by **almost 4 percentage points, roughly doubling** detected off-platform transactions. Letting participants negotiate their own price amplified leakage only among pairs that already had experience of bypassing (abstract-level) — [PlatStrat 2023 paper 27](https://questromworld.bu.edu/platformstrategy/wp-content/uploads/sites/49/2023/06/PlatStrat2023_paper_27.pdf)
- Gu & Zhu (Management Science 67(2), 2021): an RCT on a large Chinese freelance marketplace. Better reputation information raised the chance that high-quality freelancers were hired, **and** raised disintermediation, which was detected from chat phrases such as "my phone number". A secondary listing reports that blocking a hard-to-monitor alternative communication channel cut disintermediation by about **18%** (unverified exact figure) — [HBS faculty page](https://www.hbs.edu/faculty/Pages/item.aspx?num=56906); [Feng Zhu PDF](http://fengzhu.info/disintermediation.pdf); [Semantic Scholar](https://www.semanticscholar.org/paper/Trust-and-Disintermediation:-Evidence-from-an-Gu-Zhu/e51e7f9587a8e0c6d214ecd7a57bae0d97101524)

**Company disclosures**
- Upwork's FY2019 10-K has a dedicated risk factor, "Users may circumvent our platform, which could adversely impact our business". It also says users "have in the past" left because they felt fees were out of line with the value they got — [Upwork 10-K FY2019 (SEC)](https://www.sec.gov/Archives/edgar/data/1627475/000162747520000006/upwk-20191231.htm)
- Upwork support material says that once a contract moves off-platform, Upwork no longer provides support, payment protection or dispute resolution — [cited in search summary of Upwork policy; see 10-K FY2024](https://www.sec.gov/Archives/edgar/data/1627475/000162747525000011/upwk-20241231.htm)
- Homejoy (home cleaning, shut down in 2015): cleaners set up direct arrangements with clients, which was one contributor to poor retention. The CEO named worker-classification lawsuits as the deciding factor in the closure. The source is a Harvard course blog, so treat it as secondary — [HBS Digital Initiative](https://d3.harvard.edu/platform-digit/submission/homejoy-a-silicon-valley-darlings-path-to-the-grave/)

**Drivers and risk categories (theory and practitioner)**
- Hagiu & Wright (Platform Chronicles) name the key question: are users mainly doing **repeat transactions with the same counterparties**, or one-off transactions with many? Repeat interactions raise the savings from going off-platform, and transactions done in person are harder to police — [Platform leakage I](https://platformchronicles.substack.com/p/platform-leakage)
- Sharetribe lists the risk factors as repetitive transactions, service-based models, large transaction values and offline fulfilment. Its advice: "expect repeat services to leak first" — [Sharetribe Academy](https://www.sharetribe.com/academy/how-to-discourage-people-from-going-around-your-payment-system/)
- Van Alstyne (HBR, Aug 2023) gives six diagnostic factors for leakage risk: urgency, rake, risk, skill, frequency and modularity. His view is that disintermediation is "a sign that your customers don't think you are adding as much value as you think you are". He also notes that most leavers move to a cheaper intermediary rather than going fully direct (opinion/framework) — [HBR](https://hbr.org/2023/08/why-customers-leave-platforms-and-how-to-retain-them); [BU Insights](https://insights.bu.edu/why-customers-leave-platforms-and-how-to-retain-them/?amp=1)
- Theory on repeat transactions (Enache & Rhodes, Management Science 2025): the platform's optimal response is "front-loaded" pricing, charging more on earlier transactions — [TSE WP 1645](https://www.tse-fr.eu/sites/default/files/TSE/documents/doc/wp/2025/wp_tse_1645.pdf); [Management Science](https://pubsonline.informs.org/doi/10.1287/mnsc.2025.02150)
- Christmann & Rösch (2025) argue that some leakage can raise platform value by growing the user base and strengthening network effects (theory) — [MPRA](https://mpra.ub.uni-muenchen.de/126803)

### Inferences
- MaterialHub's core B2B flow scores high on almost every risk factor in the literature. Packaging buyers reorder the same SKU from the same supplier, order values are high (cartons, rolls and print runs), specs are custom and negotiated, delivery is physical and offline, and urgency is low for planned reorders. Leakage risk is therefore likely closer to the high Airbnb/Xie-Zhu end than the cleaning-app low end. That holds for the second and later orders in particular.
- The first order is the defensible transaction, because discovery and trust are what the platform actually supplies. The literature consistently says the value of the platform falls once the pair trusts each other. Revenue models that depend on a percentage of every reorder are the most exposed.
- RFQ and chat (roadmap item 3) improve matching but also hand buyer and supplier the trust that Gu & Zhu show drives bypass. Quote chat should therefore be paired with transaction-side value, not just better discovery.
- B2C craft and sample-pack orders are low-value, one-off and multi-vendor, so they carry low leakage risk.

### Gaps
- I found no published leakage rates for B2B goods marketplaces (Faire, Alibaba, IndiaMART, Tradeling, Udaan). Companies do not disclose them. Every quantified estimate above is for services or rentals.
- I found no Thumbtack or Angi data on repeat-customer leakage. The sources only cover their pay-per-lead pricing.
- The Zhu & Iansiti HBR piece named in the brief was not located. Its title may be different (Zhu & Iansiti's 2019 HBR article "Why Some Platforms Thrive and Others Don't" names disintermediation as one network weakness, but I did not verify that).

## 2. Mitigation strategies and the evidence for each

### Takeaway
Rigorous evidence supports three kinds of lever. Transaction-side features that make the on-platform transaction better (instant booking or curation on Airbnb, 23-30% fewer leaked days) work. Restricting off-platform communication works (about 18% in Gu & Zhu, unverified). Commission levels matter: a 15% fee doubled leakage. The theory and the strongest practitioner cases (Faire Direct, Alibaba Trade Assurance) favour "carrots", meaning value plus fees that fall or vanish on relationships the platform didn't create, over penalties.

### Cited Findings
**Theory: the menu**
- Hagiu & Wright, "Marketplace Leakage" (Management Science 70(3), 2024), model six strategies: (1) invest in transaction benefits, such as payment protection; (2) limit communication; (3) charge referral fees instead of transaction fees; (4) price-parity clauses; (5) more seller competition; (6) hide sellers that induce too much leakage — [IDEAS/RePEc](https://ideas.repec.org/a/inm/ormnsc/v70y2024i3p1529-1553.html); [working paper PDF](https://www.andreihagiu.com/Leakage%20Final.pdf)
- Hagiu & Wright's "Platform leakage II" prefers building value that keeps transactions on-platform over complex fee schedules — [Platform Chronicles](https://platformchronicles.substack.com/p/platform-leakage-ii-the-good-the)
- Xie & Zhu discuss targeted coupons, monitoring technology and matching policy as levers that realign incentives (abstract-level) — [PlatStrat 2023](https://questromworld.bu.edu/platformstrategy/wp-content/uploads/sites/49/2023/06/PlatStrat2023_paper_27.pdf)
- Sekar & Siddiq (Operations Research, 2025) find that more information raises revenue only up to a threshold, beyond which leakage erodes it. In high-information settings the platform may do better by **raising** commissions, which runs against intuition — [SSRN](https://papers.ssrn.com/sol3/papers.cfm?abstract_id=4378501); [INFORMS](https://pubsonline.informs.org/doi/fpi/10.1287/opre.2025.2046)
- Hagiu & Rothman (HBR, Apr 2016) list "using sticks rather than carrots to deter disintermediation" as one of the classic marketplace pitfalls — [catalogue record](https://catalogosiidca.csuca.org/Record/CR.UNA01000289904/Details)
- Van Alstyne (HBR 2023): "sticks… do not engender goodwill". The remedy is to create more value than the platform takes — [HBR](https://hbr.org/2023/08/why-customers-leave-platforms-and-how-to-retain-them)

**Lever-by-lever evidence**
- *Transaction benefits / trust:* Airbnb's Instant Book and Plus cut leaked days by 30.2% and 23.5% (abstract-level) — [ICIS 2022](https://aisel.aisnet.org/icis2022/sharing_econ/sharing_econ/12/)
- *Escrow / buyer protection:* Alibaba.com Trade Assurance starts protection only once the buyer pays through the platform. Funds are held until receipt is confirmed, with protection continuing 30 days after receipt. Third-party guides say that paying off-platform is the most common way buyers lose cover — [Alibaba Help Center](https://helpcenter.alibaba.com/s/buyer/knowledge?questionId=92572963d7b2496680fabbb2038ac60asgvpc278077001&categoryId=9207651&categoryId=9207651&questionId2=20153048&pageId=128&category=9207651&knowledge=20153048&language=en); [Alibaba seller blog](https://seller.alibaba.com/businessblogs/alibaba-trade-assurance-how-order-protection-works-for-buyers-and-sellers-px002dpu1)
- *Communication limits / contact masking:* Gu & Zhu report about an 18% reduction from blocking an alternative channel (unverified figure) — [HBS](https://www.hbs.edu/faculty/Pages/item.aspx?num=56906). Sharetribe warns that message filters can be circumvented and need complementary measures — [Sharetribe docs](https://www.sharetribe.com/docs/concepts/messages-notifications/messages/)
- *Fee level:* introducing a 15% commission raised leakage by about 4pp, roughly doubling it — [Xie & Zhu](https://questromworld.bu.edu/platformstrategy/wp-content/uploads/sites/49/2023/06/PlatStrat2023_paper_27.pdf)
- *Declining or zero fees on relationships the vendor brings (Faire):*
  - Faire charges 15% on marketplace reorders. For a new retailer's first order it adds a one-time 10% referral fee (25% total) for non-North-American brands, or a $10 new-customer fee for US and Canadian brands. Sources conflict slightly on these details — [Faire brand support](https://www.faire.com/support/brands); [eightx](https://eightx.co/blog/faire-wholesale-take-rate-margin-impact)
  - Orders from retailers the brand brings through its Faire Direct link carry **0% commission**. Under the policy as updated on 9 Jan 2024, the rate applies to new relationships formed on or after that date. Retailers that don't qualify automatically can be moved to 0% through a documented request — [Faire Help Center](https://www.faire.com/support/articles/20178862736539); [Faire Help Center 2](https://www.faire.com/en/support/articles/36955649864091)
  - Faire stopped issuing advertising credits for new retailer referrals from 1 Jan 2026 — [Faire Help Center](https://www.faire.com/support/articles/37520933714203)
  - Third-party sources say payment processing (about 1.9-3.5% + $0.30) may still apply on 0% orders (unverified against Faire terms) — [Craftybase](https://app.craftybase.com/faire-fee-calculator)
- *Front-loaded pricing:* in theory the platform charges more for early transactions with a counterparty and less for later ones — [Enache & Rhodes](https://www.tse-fr.eu/sites/default/files/TSE/documents/doc/wp/2025/wp_tse_1645.pdf)
- *Trade credit / embedded finance:* vendor and fintech commentary claims that net terms raise B2B retention ("credit is a huge unlock… once retention is achieved"). No controlled evidence was found, and one guide warns that finance programmes can lift first-order conversion without improving retention — [FinTech Collective](https://fintech.io/articles/b2b-marketplaces-the-next-wave); [Balance](https://www.getbalance.com/post/tips-b2b-ecommerce-marketplace/)
- *Tradeling (UAE) credit:* Tradeling offers buy-now-pay-later at 0% interest for 60 days (an older page says 90 days). One source says the first five purchases carry no extra charge and later ones a 1.5% fee, with seller fees of about 3.5%. Suppliers are paid immediately through an arrangement with the Etihad Credit Bureau. Sources are dated, so check current terms — [Gulf News](https://gulfnews.com/business/retail/dubai-owned-b2b-marketplace-tradeling-is-out-to-win-the-percentage-game-1.85940538); [MyBayut](https://www.bayut.com/mybayut/tradeling-dubai/)
- *Antitrust caution:* Julian Wright (TSE 2025 slides) asks whether it is anticompetitive for platforms to limit disintermediation, and argues that the "free-riding defence" is "not so clear cut". Price-parity clauses and contact bans may attract regulatory scrutiny — [Wright slides](https://www.tse-fr.eu/sites/default/files/TSE/documents/conf/2025/digital/wright_slides.pdf)

### Inferences
- The levers ranked by evidence: (1) transaction-side value plus payment protection (empirical support, and it compounds); (2) a low or declining take rate on repeat pairs (the Xie-Zhu fee effect, Faire practice, front-loading theory); (3) communication limits (works partially, but costs goodwill and conflicts with RFQ chat); (4) penalties and parity clauses (weakest goodwill, possible legal risk).
- SaaS lock-in (making MaterialHub the vendor's system of record) has no direct empirical evidence in the sources found. It is inferred from the "transaction benefits" logic. Faire Direct is the clearest case where a marketplace effectively becomes the vendor's wholesale order tool for its own customers.

### Gaps
- No quantitative evidence was found on contact masking in B2B goods (as opposed to services), on loyalty rebates, or on consolidated invoicing as leakage deterrents.
- Faire has not disclosed what share of GMV is Faire Direct or how leakage changed after it launched.
- I could not find a controlled study of trade credit's effect on leakage.

## 3. Business models that accept leakage and still win, versus transaction models

### Takeaway
Lead-generation and membership models (IndiaMART subscriptions, Alibaba.com supplier memberships, Thumbtack and Angi pay-per-lead) make leakage irrelevant to revenue, because they charge for the introduction, not the transaction. They give up visibility into GMV and the ability to sell payments or credit. Transaction models (Faire, Upwork, Tradeling) collect more per relationship but must keep adding transaction-side value to justify it.

### Cited Findings
- IndiaMART: buyers use it free, suppliers pay subscriptions (Freemium, Silver, Gold, Platinum tiers with RFQ credits). The company describes "a subscription based revenue model with negative working capital" — [IndiaMART Annual Report FY2022-23](https://investor.indiamart.com/files/IndiaMART_Annual_Report_FY_2022-23.pdf); [Annual Report FY2020-21](https://investor.indiamart.com/files/ANNUAL_REPORT_FY2020-21.pdf)
- IndiaMART had about 217K paying suppliers in Q4 FY25, with annualised revenue per paying supplier of about ₹62K — [Q4 FY25 investor presentation](https://investor.indiamart.com/files/INDIAMART_29042025161920_Investor_Presentation_Q4FY25.pdf)
- IndiaMART in Q2 FY27 (secondary report): a net decline of 615 paying suppliers to about 217K, revenue up about 10% YoY to INR 429 crore, and the top 10% of paying suppliers (about 22K) contributing 51% of revenue — [Investing.com](https://www.investing.com/news/company-news/indiamart-q2-fy27-slides-margins-surge-amid-supplier-base-decline-93CH-4975621)
- Alibaba.com: suppliers pay membership fees (Gold or Verified). Third-party figures conflict, from about $4,700 a year to about $12,500 a year depending on tier and country. Alibaba's seller blog claims a 0% commission for some sellers (unverified). Monetisation is mainly memberships and marketing, with Trade Assurance to keep payments on-platform — [Alibaba seller blog](https://seller.alibaba.com/blogs/2026/southeast-asia/food-beverage/gold-supplier-membership-guide-alibaba-b2b); [QualityInspection.org](https://qualityinspection.org/alibaba-gold-supplier/)
- Angi/HomeAdvisor and Thumbtack: pros pay per lead whether or not the job closes. Angi often shares a lead across 2-5 pros and also sells monthly advertising packages ($300-$3,000+ a month per a third-party source). In 2023 the FTC ordered the company to pay up to $7.2M over deceptive lead-quality claims (secondary sources) — [Leadgen Economy](https://www.leadgen-economy.com/blog/home-improvement-lead-marketplaces-angi-thumbtack-homeadvisor/); [Charge Home Solutions](https://chargehomesolutions.com/blog/angi-vs-thumbtack-for-electricians/)
- Wright (2025): transaction fees are optimal "particularly… if most of the value platform offers is for connecting participants", which is also when leakage risk is highest — [Wright slides](https://www.tse-fr.eu/sites/default/files/TSE/documents/conf/2025/digital/wright_slides.pdf)
- Hagiu & Wright list referral fees (charging for the match, not the transaction) as one of their six anti-leakage strategies — [IDEAS/RePEc](https://ideas.repec.org/a/inm/ormnsc/v70y2024i3p1529-1553.html)

### Inferences
- The lead-gen model's weaknesses show in the evidence. Revenue is concentrated (IndiaMART's top 10% of suppliers give 51%), there is supplier-side churn, and lead-quality disputes reach regulators (Angi). In a small market like the UAE, with a limited number of packaging suppliers, a pure subscription model caps revenue at supplier count × subscription price.
- A hybrid suits MaterialHub. Charge a fee per introduction or first order and a vendor SaaS or subscription fee, then a low rate (mostly payments and credit margin) on reorders. This keeps payments, credit and logistics revenue (which only exist when transactions stay on-platform) while not taxing relationships the platform no longer earns.

### Gaps
- No public data compares lifetime value under lead-gen versus transaction models for B2B goods.
- I found no published take-rate or leakage disclosures for Udaan or Tradeling.

## 4. Recommendations for a packaging-materials marketplace where buyers already know suppliers and use WhatsApp

### Takeaway
Treat existing supplier-buyer relationships as a Faire Direct-style acquisition channel, not as leakage. Concentrate the commission on platform-originated first orders and RFQ wins. Keep reorders on-platform by offering things WhatsApp cannot: trade credit, protected payment, one VAT invoice across suppliers, sample logistics, quantity-break price tracking and a reorder button. Penalties should be a light backstop only.

### Cited Findings
- Faire's split model is a working precedent: 0% on retailers the brand brings, standard commission on marketplace-originated retailers, with 25% or a fee on the first order and 15% on reorders — [Faire Help Center](https://www.faire.com/support/articles/20178862736539); [Faire brand support](https://www.faire.com/support/brands)
- The fee level itself drives leakage (a 15% commission doubled it) — [Xie & Zhu](https://questromworld.bu.edu/platformstrategy/wp-content/uploads/sites/49/2023/06/PlatStrat2023_paper_27.pdf)
- Payment protection only applies to on-platform payment (Alibaba Trade Assurance, Upwork's policy) — [Alibaba Help Center](https://helpcenter.alibaba.com/s/buyer/knowledge?questionId=92572963d7b2496680fabbb2038ac60asgvpc278077001&categoryId=9207651&categoryId=9207651&questionId2=20153048&pageId=128&category=9207651&knowledge=20153048&language=en); [Upwork 10-K FY2019](https://www.sec.gov/Archives/edgar/data/1627475/000162747520000006/upwk-20191231.htm)
- A regional competitor already uses BNPL credit and instant supplier payout as its value proposition (Tradeling) — [Gulf News](https://gulfnews.com/business/retail/dubai-owned-b2b-marketplace-tradeling-is-out-to-win-the-percentage-game-1.85940538)
- Communication filters are leaky and need other measures alongside them — [Sharetribe docs](https://www.sharetribe.com/docs/concepts/messages-notifications/messages/)

### Inferences (recommendations; opinion grounded in the evidence above)
1. **Fee design (highest leverage).** Use a front-loaded commission: a higher rate on the first order between a new buyer-supplier pair found through MaterialHub search or RFQ, and a sharply lower rate on later reorders. Charge 0% commission (payment processing only) on buyers the vendor invites ("MaterialHub Direct"). Add a vendor SaaS tier for inventory, quotes and payouts so revenue doesn't depend on the reorder take. The codebase already has `commissions` and `vendor_payouts` ledgers. Making the commission rate a function of pair origin and order sequence fits that model.
2. **Transaction-side value WhatsApp lacks.**
   - Trade credit and net terms through the business-accounts roadmap item (TRN, credit terms), plus Tabby and Tamara for smaller buyers.
   - Protected payment: hold funds until delivery confirmation and handle disputes.
   - One VAT-compliant invoice and one delivery per multi-supplier order.
   - Sample ordering with discounted shipping.
   - Quantity-break price history and one-click reorder.
   - Multi-user purchasing approvals.
   
   Each of these is only available on-platform.
3. **Make WhatsApp a channel, not a rival.** Let vendors send buyers a MaterialHub quote or pay link over WhatsApp, so the conversation can stay on WhatsApp while the transaction (and credit and invoice) runs through MaterialHub. This follows the Faire Direct logic of capturing the vendor's own channel.
4. **Communication limits, used lightly.** Mask phone numbers and emails in RFQ and quote chat before the first order is placed, then relax masking once a pair has transacted on-platform. Gu & Zhu suggest that blocking side channels before trust forms is where restriction pays off.
5. **Penalties as a backstop.** Write a terms-of-service clause against soliciting buyers found via MaterialHub to pay off-platform during an initial period. Enforce it lightly, given the goodwill (HBR) and antitrust (Wright) cautions.
6. **Measure it.**
   - Track pair-level repeat rate and the reorder interval per SKU. A pair whose reorders stop while the buyer stays active is a leakage signal.
   - Detect contact-sharing phrases in chat, as Gu & Zhu did, for measurement rather than punishment.
7. **Plan the business case expecting most reorder GMV from known pairs to leak unless items 1-3 exist.** That is an inference; no B2B goods benchmark was found.

### Gaps
- I found no data on WhatsApp's share of B2B ordering in the UAE or GCC, or on how WhatsApp-native ordering competes with marketplaces in packaging.
- I found no UAE-specific evidence on how buyers respond to trade credit.

## 5. Does verticalising to packaging increase or decrease leakage risk versus a broad all-materials marketplace?

### Takeaway
No direct empirical study was found. The theory points both ways. A narrow vertical concentrates spend on a few repeat suppliers, which raises leakage risk. Depth (specs, samples, quantity tiers, RFQ) adds transaction-side value, which lowers it. A broad multi-category cart with one invoice and one delivery is a real anti-leakage benefit only if buyers actually buy across categories and suppliers in one order.

### Cited Findings
- Leakage risk rises with repeat transactions with the same counterparty and falls when users do one-off transactions with many counterparties — [Platform leakage I](https://platformchronicles.substack.com/p/platform-leakage); [Sharetribe Academy](https://www.sharetribe.com/academy/how-to-discourage-people-from-going-around-your-payment-system/)
- "Modularity" and "frequency" are among the six factors in Van Alstyne's diagnostic. Frequent, modular needs that one provider can meet favour going direct — [HBR 2023](https://hbr.org/2023/08/why-customers-leave-platforms-and-how-to-retain-them)
- Introducing seller competition is a Hagiu & Wright anti-leakage strategy. More substitutable suppliers make buyers less tied to one — [IDEAS/RePEc](https://ideas.repec.org/a/inm/ormnsc/v70y2024i3p1529-1553.html)
- Transaction benefits that only exist on-platform reduce leakage — [Hagiu & Wright](https://www.andreihagiu.com/Leakage%20Final.pdf); [ICIS 2022 Airbnb evidence](https://aisel.aisnet.org/icis2022/sharing_econ/sharing_econ/12/)

### Inferences
- If a packaging buyer's needs map to one or two suppliers (for example, a carton converter plus a paper merchant), the platform offers little after the first match. Leakage risk is then **higher** in a narrow vertical.
- A rigid-box or book-binding maker, by contrast, needs greyboard, paper, book cloth, magnets, hinges, adhesive and ribbon from several specialist suppliers. That buyer gets real value from a multi-supplier cart, one invoice, one credit line and consolidated delivery. MaterialHub's current catalogue (papers, boards, leather, cloth, hinges, magnets, adhesives, foils, ribbons) is already a multi-supplier bill of materials for packaging, so "vertical but multi-input" is likely the strongest position. It combines depth (specs and samples) with cross-supplier consolidation.
- Broadening to all materials helps against leakage only through the consolidation argument, and only if order baskets actually span suppliers. Measure the share of orders with two or more vendors before arguing for breadth.

### Gaps
- No empirical comparison of leakage between vertical and horizontal B2B marketplaces was found.
- I found no data on how many suppliers a typical packaging buyer uses per order in the UAE.
