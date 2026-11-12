---
name: Quotients
description: Prove the first isomorphism theorem by checking representatives.
order: 1
depends_on:
  - "[[Buches/Proofs in Linear Algebra/concepts/Linear maps#^kernel]]"
block_depends_on:
  first-isomorphism:
    - "[[#^quotient]]"
---

# Quotients

> [!definition] Quotient space
> For $U\le V$, $V/U$ consists of cosets $v+U$. Two representatives yield the same coset precisely when their difference belongs to $U$. Addition and scalar multiplication act on representatives.

^quotient

> [!exercise] The first isomorphism theorem
> Prove that $v+\ker T\mapsto T(v)$ defines an isomorphism $V/\ker T\to\operatorname{im}T$.

^first-isomorphism

> [!hint]- Well-definedness
> Compare the images of two representatives of the same coset.

> [!hint]- Bijectivity
> Compute the kernel of the induced map. The codomain was chosen to be its image.

---
<!-- buches-math: mathjax -->
Representatives of the same coset differ by a vector annihilated by $T$, so the assignment is well defined. It is linear by the quotient operations. The induced map has trivial kernel and its image is $\operatorname{im}T$ by construction.
---
