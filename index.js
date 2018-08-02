/**
 * This is the entry point for your Probot App.
 * @param {import('probot').Application} app - Probot's Application class.
 */
module.exports = app => {
  // Your code here
  app.log('Yay, the app was loaded!');

  app.on('issues.opened', async context => {
    const issueComment = context.issue({ body: 'Thanks for opening this issue!' });

    return context.github.issues.createComment(issueComment);
  })

  //cleans up the comments when the pr is deleted
  app.on('pull_request.closed', async context => {
    const params = context.issue();

    const comments = await context.github.issues.getComments({owner, repo, number});
    // app.log('comments.data', comments.data);
    const gifComments = comments.data.filter(comment => comment.body.includes(`Go for it.`));

    return gifComments.forEach(gifComment => context.github.issues.deleteComment({owner, repo, comment_id: gifComment.id}));
  })

  app.on(['pull_request.opened', 'pull_request.reopened', 'pull_request.edited'], async context => {
    const params = context.issue();
    const {owner, repo, number} = params;

    const rulesFile = await context.github.repos.getContent({owner, repo, path: '.github/PR_CHECKLIST.json'});
    const rules = JSON.parse(Buffer.from(rulesFile.data.content, 'base64').toString()).rules;

    const files = (await context.github.pullRequests.getFiles({owner, repo, number})).data.map(_ => _.filename);

    const matchingRules = rules.filter(rule => {
      const regexp = new RegExp(rule.pattern);

      return files.some(file => regexp.test(file));
    });

   const messages = [ '# Code Review Checklist' ];

   matchingRules.forEach(rule => {
     messages.push('## ' + rule.name);

     rule.checks.forEach(check => messages.push(`- [ ] ${check}`));
   });

    const prComment = context.issue({ body: messages.join('\n')});

    await context.github.issues.createComment(prComment);

    const sha = context.payload.pull_request.head.sha;

    return context.github.repos
      .createStatus({ owner, repo, sha, state: 'pending', context: 'Code Review', description: 'Checklist' });
  })

  app.on('issue_comment', async context => {

    if (context.payload.action === 'edited') {
      const body = context.payload.comment.body;

      // if this is an update to the code review checklist
      // and all the checkboxes are GTG let's add a happy picture
      if (body.includes('Code Review Checklist')) {
        const {owner, repo, number} = context.issue();

        const checklistComplete = !body.includes('[ ]');

          const message = [];
          message.push(`# Go for it.`);
          const image = `!['I like what you did there'](https://media.giphy.com/media/10PixLlze8fYiI/giphy.gif "I like what you did there")`
          message.push(image);

          const params = context.issue({body: message.join('')});

        if (checklistComplete) {
          context.github.issues.createComment(params);
        } else {
          // Remove the gif if the checklist is no longer complete
          const comments = await context.github.issues.getComments({owner, repo, number});
          // app.log('comments.data', comments.data);
          const gifComments = comments.data.filter(comment => comment.body.includes(`Go for it.`))

          return gifComments.forEach(gifComment => context.github.issues.deleteComment({owner, repo, comment_id: gifComment.id}));
        }

        // Set the checklist status to green
        const pr = await context.github.pullRequests.get({owner, repo, number});
        const sha = pr.data.head.sha;
        context.github.repos.createStatus({
          owner,
          repo,
          sha,
          state: checklistComplete ? 'success' : 'pending',
          context: 'Code Review',
          description: 'Checklist'
        });
      }
    }
  });
}
