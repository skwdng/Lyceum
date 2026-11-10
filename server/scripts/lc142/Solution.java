import java.util.*;

class ListNode {
    int val; ListNode next;
    ListNode(int x) { val = x; }
}

public class Solution {
    public ListNode detectCycle(ListNode head) {
        ListNode slow = head, fast = head;
        while (fast != null && fast.next != null) {
            slow = slow.next;
            fast = fast.next.next;
            if (slow == fast) {
                ListNode p = head;
                while (p != slow) { p = p.next; slow = slow.next; }
                return p;
            }
        }
        return null;
    }

    static ListNode build(int[] vals, int pos) {
        if (vals.length == 0) return null;
        ListNode[] ns = new ListNode[vals.length];
        for (int i = 0; i < vals.length; i++) ns[i] = new ListNode(vals[i]);
        for (int i = 0; i + 1 < vals.length; i++) ns[i].next = ns[i + 1];
        if (pos >= 0) ns[vals.length - 1].next = ns[pos];
        return ns[0];
    }

    static int indexOf(ListNode head, ListNode target) {
        ListNode p = head; int k = 0;
        while (p != null && p != target) { p = p.next; k++; }
        return p == target ? k : -1;
    }

    public static void main(String[] a) {
        Solution s = new Solution();
        int[][][] cases = {{{3,2,0,-4},{1}}, {{1,2},{0}}, {{1},{-1}}};
        int[] expect = {1, 0, -1};
        for (int i = 0; i < cases.length; i++) {
            ListNode head = build(cases[i][0], cases[i][1][0]);
            ListNode r = s.detectCycle(head);
            int idx = r == null ? -1 : indexOf(head, r);
            System.out.println("  case" + (i+1) + " 期望 " + expect[i] + " 实际 " + idx
                + (idx == expect[i] ? "  ✓" : "  ✗"));
        }
        int[] big = new int[100000];
        for (int i = 0; i < big.length; i++) big[i] = i;
        long t0 = System.nanoTime();
        ListNode r = s.detectCycle(build(big, -1));
        System.out.println("  10 万节点无环 -> " + (r == null ? "null ✓" : "误判 ✗")
            + "  用时 " + ((System.nanoTime() - t0) / 1000000) + " ms");
        ListNode r2 = s.detectCycle(build(big, 50000));
        System.out.println("  10 万节点环在 50000 -> " + (r2 == null ? "null ✗" : indexOf(build(big, 50000), r2) + " ✓"));
    }
}
