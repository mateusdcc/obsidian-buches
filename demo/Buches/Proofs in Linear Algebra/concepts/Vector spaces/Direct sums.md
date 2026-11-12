---
name: Direct sums
description: Prove uniqueness without choosing coordinates.
order: 2
depends_on:
  - "[[Buches/Proofs in Linear Algebra/concepts/Vector spaces/Subspaces#^subspace]]"
block_depends_on:
  direct-sum-criterion:
    - "[[#^direct-sum]]"
  prove-direct-sum:
    - "[[#^direct-sum-criterion]]"
---

# Direct sums

> [!definition] Direct sum
> For subspaces $U,W\le V$, write $U+W=\{u+w:u\in U,\ w\in W\}$. This sum is direct when each element of $U+W$ has a unique expression $u+w$.

^direct-sum

> [!theorem] Direct sum criterion
> The sum $U+W$ is direct if and only if $U\cap W=\{0\}$.

^direct-sum-criterion

> [!exercise] Prove the criterion in both directions
> Prove the direct sum criterion. In the direction from uniqueness, use two representations of zero.

^prove-direct-sum

> [!hint]- Subtract two decompositions
> If $u+w=u'+w'$, compare $u-u'$ and $w'-w$.

> [!hint]- Start from the intersection
> If $x\in U\cap W$, consider $x+(-x)$.

---
<!-- buches-math: mathjax -->
If the intersection is trivial, $u+w=u'+w'$ implies $u-u'=w'-w\in U\cap W$. Both differences vanish.

Conversely, if the sum is direct and $x\in U\cap W$, then $0=x+(-x)=0+0$. Uniqueness forces $x=0$.
---
