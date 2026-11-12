---
name: Linear maps
description: Relate injectivity to the kernel and factor a map through its image.
category: Structure
icon: lucide:arrow-right-left
order: 2
depends_on:
  - "[[Buches/Proofs in Linear Algebra/concepts/Vector spaces/Subspaces#^subspace-test]]"
block_depends_on:
  trivial-kernel:
    - "[[#^kernel]]"
---

# Linear maps

> [!definition] Linear map and kernel
> A map $T:V\to W$ is linear if $T(au+bv)=aT(u)+bT(v)$. Its kernel is $\ker T=\{v:T(v)=0_W\}$, a subspace of $V$.

^kernel

> [!exercise] Injectivity and the kernel
> Prove that $T$ is injective if and only if $\ker T=\{0_V\}$.

^trivial-kernel

> [!hint]- Use a difference
> Translate $T(u)=T(v)$ into a statement about $u-v$.

---

---
