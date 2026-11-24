import java.util.*;
import java.util.stream.*;

public class StrIter {
    public static void main(String[] args) {
        String s = "辩论a1";

        // ① 不能这样（编译不过）：String 没实现 Iterable
        // for (char c : s) { }

        // ② 最直接：按索引取 char
        StringBuilder a = new StringBuilder();
        for (int i = 0; i < s.length(); i++) a.append(s.charAt(i)).append('/');
        System.out.println("② charAt     : " + a);

        // ③ chars() 拿到 IntStream，再 .iterator() 得到真正的迭代器
        StringBuilder b = new StringBuilder();
        PrimitiveIterator.OfInt it = s.chars().iterator();
        while (it.hasNext()) b.append((char) it.nextInt()).append('/');
        System.out.println("③ chars().iterator(): " + b);

        // ④ 转成 List<Character>，就能用 Iterator / for-each
        List<Character> list = s.chars().mapToObj(c -> (char) c).collect(Collectors.toList());
        StringBuilder c = new StringBuilder();
        for (Iterator<Character> i2 = list.iterator(); i2.hasNext(); ) c.append(i2.next()).append('/');
        System.out.println("④ List<Character>  : " + c);

        // ⑤ emoji 陷阱：char 会把一个字符拆成两个代理项
        String emo = "辩😀";                 // 😀 = U+1F600，需要两个 char
        System.out.println("⑤ length()=" + emo.length()
                + " · codePointCount()=" + emo.codePointCount(0, emo.length()));
        StringBuilder d = new StringBuilder();
        emo.codePoints().forEach(cp -> d.append(new String(Character.toChars(cp))).append('/'));
        System.out.println("   按 codePoint 遍历: " + d);
    }
}
