---
name: Subspaces
description: Derive the closure test from the vector space axioms.
order: 1
depends_on:
  - "[[Buches/Proofs in Linear Algebra/concepts/Vector spaces#^vector-space]]"
block_depends_on:
  kernel-like-set:
    - "[[#^subspace-test]]"
---

# Subspaces

> [!definition] Subspace
> A subspace is a subset that is a vector space with the inherited operations.

^subspace

> [!theorem] Subspace test
> A nonempty subset $U\subseteq V$ is a subspace if $au+bv\in U$ for all $u,v\in U$ and $a,b\in F$.

^subspace-test

> [!exercise] A homogeneous constraint
> Prove that $U=\{(x,y,z)\in F^3:x+2y-z=0\}$ is a subspace. Identify why replacing $0$ by $1$ fails.

^kernel-like-set

> [!hint]- Test the zero vector
> Does $U$ contain $(0,0,0)$ in both versions?

> [!hint]- Check closure
> Evaluate the constraint on a linear combination of two members of $U$.

---
<!-- buches-math: mathjax -->
The zero vector belongs to $U$. If $u,v\in U$, the constraint on $au+bv$ is $a(u_1+2u_2-u_3)+b(v_1+2v_2-v_3)=0$. The subspace test applies. Replacing $0$ by $1$ excludes the zero vector.
---
