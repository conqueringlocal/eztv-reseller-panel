---
name: EZTV reseller website and inquiry extensions
description: Existing light reseller page and Sales tools patterns, documented after the local extension.
colors:
  public-ink: "#172033"
  public-paper: "#f6f7fb"
  public-surface: "#ffffff"
  public-muted: "#526077"
  public-border: "#dce2ec"
  public-input-border: "#aab4c5"
  public-action-hover: "#263651"
  reseller-accent-default: "#4f46e5"
  crm-action: "#4654f7"
  crm-action-hover: "#3b45e3"
  crm-action-tint: "#f0f4ff"
  crm-action-border: "#c7d7ff"
  crm-muted: "hsl(215.4 16.3% 46.9%)"
  crm-attention: "#78350f"
typography:
  public-headline:
    fontSize: "clamp(32px, 6vw, 58px)"
    fontWeight: 700
    lineHeight: 1.1
    letterSpacing: "-0.04em"
  public-section-title:
    fontSize: "clamp(25px, 3.5vw, 34px)"
    fontWeight: 700
    lineHeight: 1.3
    letterSpacing: "-0.02em"
  public-body:
    fontFamily: "system-ui, sans-serif"
    fontSize: "17px"
    fontWeight: 400
    lineHeight: 1.6
  public-label:
    fontSize: "15px"
    fontWeight: 600
  crm-body-small:
    fontSize: "14px"
    lineHeight: "20px"
rounded:
  public-input: "7px"
  public-action: "8px"
  public-form: "16px"
  crm-control: "6px"
  crm-card: "8px"
spacing:
  field: "12px"
  compact: "16px"
  mobile-section: "20px"
  standard: "24px"
  form: "28px"
components:
  public-submit:
    backgroundColor: "{colors.public-ink}"
    textColor: "{colors.public-surface}"
    rounded: "{rounded.public-action}"
    padding: "14px"
    width: "100%"
  public-cta:
    backgroundColor: "{colors.public-ink}"
    textColor: "{colors.public-surface}"
    rounded: "{rounded.public-action}"
    padding: "13px 22px"
  public-form:
    backgroundColor: "{colors.public-surface}"
    rounded: "{rounded.public-form}"
    padding: "28px"
  public-input:
    rounded: "{rounded.public-input}"
    padding: "12px"
    width: "100%"
  crm-button:
    backgroundColor: "{colors.crm-action}"
    textColor: "{colors.public-surface}"
    rounded: "{rounded.crm-control}"
    height: "40px"
    padding: "8px 16px"
  crm-button-outline:
    rounded: "{rounded.crm-control}"
    height: "40px"
    padding: "8px 16px"
  crm-button-ghost:
    rounded: "{rounded.crm-control}"
    height: "36px"
    padding: "0 12px"
---

# Design System: EZTV reseller website and inquiry extensions

## Overview

**Creative North Star: "The existing reseller service page"**

This is a scoped record of the shipped public reseller template, its Sales tools content editor, and inquiry delivery details. It preserves the incumbent light surfaces, dark text, system typography and reseller accent. It does not establish a new identity or describe a dashboard redesign.

Source authority: `services/websites/render.mjs`, `services/websites/content.mjs`, `src/components/sales/WebsiteContentEditor.tsx`, `SalesPageEditor.tsx`, `InquiryDeliveryStatus.tsx`, shared UI primitives and `src/index.css`. PRODUCT.md confirms preservation of the incumbent visual system; no approved replacement comp exists.

**Key Characteristics:**
- Open reading sections separated by fine rules.
- A white, bounded inquiry form with persistent labels.
- Familiar Sales tools controls and explicit textual states.

## Colors

### Primary

The public reseller accent is configurable and appears in the top page rule; the recorded default is a fallback, not a universal brand color. Public actions use Public Ink for dependable contrast. CRM actions retain the existing EZTV blue family.

### Neutral

Public Paper holds the page, Public Surface contains the form, Public Muted supports descriptions, and Public Border separates sections. The editor inherits its existing CSS custom properties; its light palette remains distinct from the server-rendered public template. CRM Attention highlights failed or unconfirmed email states alongside explanatory text.

**The Surface Boundary Rule.** Preserve each surface’s existing palette: reseller branding on the public page and EZTV controls in Sales tools.

## Typography

The public page retains its system-ui body stack, including headings. Sales tools inherits the existing Tailwind sans stack. This is a compatibility constraint for this extension, not a new display-font direction.

The public headline and section titles scale fluidly; ordinary form headings stay smaller (23px). Introduction text is larger (20px), while public labels and helper text remain subordinate (15px and 13px). Prose preserves reseller line breaks and limits measure to 72ch. CRM delivery information uses the existing small body style with medium-weight summaries.

## Layout

The public page uses one centered container (maximum 1060px, including padding) with desktop insets of 64px vertically and 24px horizontally. Reading sections are full width with fine top borders; optional steps form three columns. The inquiry area pairs contextual copy with a wider form in a 1:1.6 grid, separated by 44px.

At 700px and below, page insets become 32px by 18px, steps and inquiry columns stack, and form padding drops from 28px to 20px. Top navigation wraps. Long public text, contact addresses and CRM inquiry values can wrap anywhere. Editor fields use the existing two-column layout from 640px, with the headline spanning both columns; action groups wrap.

**The Content Fits Rule.** Long addresses, devices and messages must remain within the mobile container without horizontal scrolling.

## Elevation & Depth

Public content is flat: background changes and fine borders establish grouping, with no shadows. Existing CRM cards retain their small ambient shadow; primary CRM buttons retain medium shadows that strengthen on hover. These inherited treatments are scoped to Sales tools. Exact shadow and focus values live in the sidecar.

## Shapes

Public reading sections have square, open edges; the form uses generous rounded corners. Inputs and actions use smaller radii. Editor cards and controls keep their shared UI radii. Native disclosure markers identify FAQs and delivery details; no decorative icon system is introduced.

## Components

- **Public actions:** Dark filled CTA and full-width submit button. Hover darkens to Public Action Hover; keyboard focus has a visible 3px outline with 4px offset. Submission disables the button and changes its label; successful submission replaces the form with a status message. Preview also disables submission and labels that state.
- **Public fields:** Full-width, outlined inputs and a vertically resizable message field. Labels remain visible; optional fields say so. Consent controls pair a native checkbox with wrapping text.
- **Public navigation:** Small inline anchor links wrap in the top bar. Hover underlines links. Smooth in-page scrolling respects reduced-motion preference. The logo is contained without cropping.
- **Reading sections and FAQs:** About, services and devices are open prose sections. Empty optional content disappears. Native FAQ disclosures have ruled rows and visible focus. Optional steps are an ordered list, not cards.
- **Editor controls:** Existing primary, outline and ghost buttons retain their shared states. Textareas, FAQ rows and legends use the existing compact spacing and borders. Public content and private setup fields remain visibly named; private/public state is written in text above the editor.
- **Inquiry delivery details:** A native disclosure contains dated CRM records, textual email status and wrapping prospect details. Failed or uncertain delivery adds attention-colored guidance while keeping the saved inquiry readable. Provider acceptance is named precisely; color alone never communicates status.

## Do's and Don'ts

### Do:
- **Do** preserve the existing system typography, light surfaces and reseller logo treatment within this extension.
- **Do** retain visible labels, keyboard focus and explicit private, published and delivery states.
- **Do** test long content in the stacked mobile layout.

### Don't:
- **Don't** turn open public reading sections into a new dashboard-style card grid.
- **Don't** use a reseller accent as a replacement for the CRM action palette.
- **Don't** imply a successful inquiry or provider-accepted email confirms inbox delivery.
