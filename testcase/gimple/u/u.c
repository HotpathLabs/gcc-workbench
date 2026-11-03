#include <setjmp.h>
#include <stdarg.h>
#include <stdlib.h>
int g, garr[8];
struct P { int x, y; };
struct B { unsigned a : 3, b : 5; };
extern void die (void) __attribute__ ((noreturn));
extern int ext (int *);
int asmf (int a)
{
  int r, k = a;
  __asm__ ("addl %1, %0" : "=r" (r) : "r" (a));
  __asm__ volatile ("incl %0" : "+r" (k));
  return r + k;
}
int counter (void)
{
  static int count = 0;
  count++;
  return count;
}
int shadow (int n)
{
  int s = 0;
  for (int i = 0; i < n; i++) s += i;
  for (int i = n; i > 0; i--) s -= i;
  { int s = 5; g = s; }
  return s;
}
int cgoto (int k)
{
  static void *tab[] = { &&l1, &&l2 };
  goto *tab[k & 1];
l1: return 1;
l2: return 2;
}
int ulabel (int n)
{
  int t = 0;
retry:
  t++;
  if (t < n) goto retry;
  return t;
}
struct P mkp (int a)
{
  struct P p = { a, a + 1 };
  return p;
}
int bits (struct B *b, struct B c)
{
  c.b = 3;
  b->a = c.b;
  return c.a + b->b;
}
int va (int n, ...)
{
  va_list ap;
  va_start (ap, n);
  int s = 0;
  for (int i = 0; i < n; i++) s += va_arg (ap, int);
  va_end (ap);
  return s;
}
jmp_buf jb;
int sj (int x)
{
  volatile int v = x;
  if (setjmp (jb))
    return v;
  v++;
  ext ((int *) &v);
  return 0;
}
int nr2 (int x)
{
  if (x > 3) die ();
  return x * 2;
}
int glob (int i)
{
  g = i;
  garr[i] = g + 1;
  ext (&g);
  return g + garr[2];
}
int arr (int i)
{
  int a[4] = {1, 2, 3, 4};
  a[i] = 7;
  ext (a);
  return a[i & 3];
}
typedef int v4si __attribute__ ((vector_size (16)));
v4si vv (v4si a, v4si b) { return a * b + (v4si){1,1,1,1}; }
int cnd (int a, int b) { return a > b ? a - b : b - a; }
char ch (const char *s) { return s[0] == '\'' ? '\377' : 'x'; }
