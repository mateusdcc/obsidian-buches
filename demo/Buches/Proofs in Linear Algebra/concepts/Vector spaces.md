---
name: Vector spaces
description: Separate the additive group from the scalar action.
category: Foundations
icon: lucide:box
order: 1
depends_on: []
---

# Vector spaces

> [!definition] Vector space
> Over a field $F$, a vector space $V$ is an abelian group under addition together with an action $F\times V\to V$. It satisfies $1v=v$, $(ab)v=a(bv)$, $(a+b)v=av+bv$, and $a(v+w)=av+aw$.

^vector-space

> [!exercise] The zero scalar acts as zero
> Prove $0v=0_V$ for every $v\in V$, using only the axioms.

^zero-scalar

> [!hint]- Compare two expressions
> Expand $(0+0)v$.

---
<!-- buches-math: mathjax -->
By distributivity, $0v=(0+0)v=0v+0v$. Add the additive inverse of $0v$ to both sides to get $0_V=0v$.
---
